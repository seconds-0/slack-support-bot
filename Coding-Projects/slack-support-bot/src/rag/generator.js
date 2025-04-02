const { ChatVertexAI } = require('@langchain/google-vertexai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { RunnableSequence } = require('@langchain/core/runnables');
const { formatDocumentsAsString } = require('langchain/util/document');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../config');

// --- Load Style Examples --- //
let STYLE_EXAMPLES = [];
let FORMATTED_STYLE_EXAMPLES = 'No style examples loaded.';
try {
  const examplesPath = path.join(
    __dirname,
    '..',
    'config',
    'style-examples.json'
  );
  const examplesJson = fs.readFileSync(examplesPath, 'utf-8');
  STYLE_EXAMPLES = JSON.parse(examplesJson);
  if (Array.isArray(STYLE_EXAMPLES) && STYLE_EXAMPLES.length > 0) {
    FORMATTED_STYLE_EXAMPLES = STYLE_EXAMPLES.map((ex) => `- ${ex}`).join('\n');
    console.log(`Successfully loaded ${STYLE_EXAMPLES.length} style examples.`);
  } else {
    console.warn(
      'Loaded style-examples.json, but it was empty or not an array.'
    );
    FORMATTED_STYLE_EXAMPLES = 'Style examples file was empty or invalid.';
  }
} catch (error) {
  console.error('Error loading style-examples.json:', error);
  FORMATTED_STYLE_EXAMPLES = 'Error loading style examples.';
  // Depending on requirements, you might want to throw an error here
  // or allow the bot to continue with a default personality.
}

// --- LLM and Prompt Configuration --- //

let llm; // Cache LLM client instance
let config;

/**
 * Initializes and returns the ChatVertexAI LLM client.
 * Caches the instance after the first call.
 * @returns {Promise<ChatVertexAI>}
 */
async function getLlmClient() {
  if (llm) {
    return llm;
  }

  console.log('Initializing Gemini LLM Client...');
  try {
    config = await getConfig(); // Ensure config is loaded

    // Validate config
    if (
      !config.vertexAiLlmModelName ||
      !config.gcpProjectId ||
      !config.gcpRegion
    ) {
      throw new Error(
        'Missing required config for LLM: Model Name, Project ID, Region'
      );
    }

    llm = new ChatVertexAI({
      modelName: config.vertexAiLlmModelName, // e.g., "gemini-1.0-pro"
      temperature: 0.2, // Lower for factual RAG, adjust as needed
      maxOutputTokens: 1024, // Adjust as needed
      projectId: config.gcpProjectId,
      location: config.gcpRegion,
      // Credentials handled implicitly by google-auth-library (ADC)
    });
    console.log(
      `Gemini LLM Client initialized with model ${config.vertexAiLlmModelName}.`
    );
    return llm;
  } catch (error) {
    console.error('Failed to initialize Gemini LLM Client:', error);
    throw error; // Re-throw for upstream handling
  }
}

// Updated RAG Prompt Template to include Slack history AND Personality with refined guidance
const RAG_PROMPT_TEMPLATE = `You are an AI assistant embedded within a Slack bot, designed to help developers solve on-call issues using company runbooks and conversation history. Your goal is to provide clear, concise, and accurate answers based *strictly* on the provided context (runbooks) and the recent conversation history.

<<< IMPORTANT PERSONALITY INSTRUCTIONS >>>
Your responses MUST emulate the writing style demonstrated in the examples below. Be direct, largely informal, use technical language confidently, inject mild humor/sarcasm where appropriate, tag users when needed, share links, prioritize action, and be supportive. Adapt formality based on the situation implied by the history/question.

Style Examples to Emulate:
---------------------------
${FORMATTED_STYLE_EXAMPLES}
---------------------------

<<< END PERSONALITY INSTRUCTIONS >>>

Follow these instructions carefully for generating the response content:
1. Analyze the user's question, the provided runbook context, and the Slack conversation history.
2. Synthesize an answer using *only* the information present in the runbook context and the conversation history. Prioritize information from the runbooks if available.
3. If the runbook context contains relevant steps or instructions, present them clearly as numbered or bulleted lists for better readability.
4. If the information is only in the conversation history, summarize it accurately and mention that you're basing your answer on previous conversations.
5. If neither the runbooks nor the history contains relevant information, state clearly that you cannot answer based on the provided information. Never invent an answer or make up facts.
6. For ambiguous questions, briefly acknowledge the ambiguity and provide the most reasonable interpretation based on context. If truly unclear, ask a focused clarifying question.
7. Keep responses concise and focused on actionable solutions. Aim for 3-7 sentences for simple questions and no more than 10-15 sentences for complex ones unless detailed steps are required.
8. For step-by-step instructions, use numbered lists and emphasize critical steps or warnings.
9. When using technical terminology or mentioning system names, ensure they exactly match what's in the runbooks.
10. Always prefer direct, practical advice over theoretical explanations when the question implies an urgent problem.

Conversation History (Oldest to Newest):
------------------------------------------
{slack_history}
------------------------------------------

Context from Runbooks:
----------------------
{context}
----------------------

User's Question: {question}`;

const ragPrompt = PromptTemplate.fromTemplate(RAG_PROMPT_TEMPLATE);

// --- Generator Function --- //

/**
 * Generates an answer using the RAG pipeline (retrieved docs + history + LLM).
 * @param {string} question - The user's original question.
 * @param {Array<import("@langchain/core/documents").Document>} documents - Documents retrieved from Vector Search.
 * @param {string} slackHistory - Formatted string of Slack conversation history.
 * @returns {Promise<string>} - The generated answer string.
 */
async function generateAnswer(question, documents, slackHistory) {
  // Add validation for slackHistory
  if (
    !question ||
    documents === null ||
    documents === undefined ||
    slackHistory === undefined
  ) {
    console.error(
      'generateAnswer received invalid input (question, documents, or slackHistory).'
    );
    return 'Error: Invalid input provided for answer generation.';
  }

  try {
    const currentLlm = await getLlmClient();

    const ragChain = RunnableSequence.from([
      {
        // Prepare context, history and question for the prompt template
        context: (input) => formatDocumentsAsString(input.documents),
        slack_history: (input) => input.slackHistory,
        question: (input) => input.question,
        // No need to pass style_examples here, it's embedded in the template
      },
      ragPrompt,
      currentLlm,
      new StringOutputParser(),
    ]);

    console.log(
      `Invoking RAG generation chain with history for question: "${question.substring(0, 50)}..."`
    );

    // Invoke the chain, passing history
    const answer = await ragChain.invoke({
      question,
      documents,
      slackHistory,
    });

    console.log(
      `LLM generation completed. Answer length: ${answer?.length || 0}`
    );
    return answer || 'LLM returned an empty response.';
  } catch (error) {
    console.error(`Error during RAG generation: ${error.message}`, error.stack);
    return 'Sorry, I encountered an internal error while trying to generate an answer.';
  }
}

// --- Exports --- //
module.exports = { generateAnswer };
