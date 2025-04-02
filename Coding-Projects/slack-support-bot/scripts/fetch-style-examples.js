/*
 * ONE-TIME USE SCRIPT
 * Fetches messages from a specified user via Slack search, filters them,
 * and saves a selection to style-examples.json for manual curation.
 *
 * Requires environment variables:
 *  - SLACK_BOT_TOKEN: Needs search:read scope.
 *  - PERSONALITY_USER_ID: The Slack User ID (e.g., UXXXXXXXX) to fetch messages from.
 *
 * Usage: node scripts/fetch-style-examples.js
 */

const { WebClient } = require('@slack/web-api');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
const readline = require('readline');

dotenv.config(); // Load .env file if present

// --- Configuration --- //
const OUTPUT_DIR = 'output';

// --- Environment Variable Validation --- //
const botToken = process.env.SLACK_BOT_TOKEN;

if (!botToken) {
  console.error(
    'Error: SLACK_BOT_TOKEN environment variable is missing. This token needs the search:read scope.'
  );
  process.exit(1);
}

// --- Helper for Reading Input --- //
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// --- Helper Functions --- //

async function promptForUserId() {
  const userId = await askQuestion(
    'Please enter the Slack User ID (e.g., UXXXXXXXX): '
  );
  if (!userId || !userId.trim().match(/^[UW][A-Z0-9]{8,}$/i)) {
    throw new Error('Invalid Slack User ID format provided.');
  }
  return userId.trim();
}

// Placeholder for channel selection logic
async function selectChannel(client) {
  console.log(
    '\nFetching channel list (public & private). This may take a moment...'
  );

  let allChannels = [];
  let cursor;
  const MAX_CHANNELS_TO_FETCH = 500; // Safety limit

  try {
    do {
      // eslint-disable-next-line no-await-in-loop
      const response = await client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 200, // Max limit per page is often 1000, but 200 is safer
        cursor,
        exclude_archived: true,
      });

      if (!response.ok) {
        throw new Error(`Slack API error fetching channels: ${response.error}`);
      }

      allChannels = allChannels.concat(response.channels);
      cursor = response.response_metadata?.next_cursor;

      if (allChannels.length >= MAX_CHANNELS_TO_FETCH) {
        console.warn(
          `Reached fetch limit (${MAX_CHANNELS_TO_FETCH}) channels. List may be incomplete.`
        );
        break;
      }
    } while (cursor);
  } catch (error) {
    console.error('Failed to fetch channel list:', error);
    throw new Error('Could not retrieve channel list from Slack.'); // Re-throw for main handler
  }

  // Filter for channels the bot is likely in (is_member isn't always reliable, especially for public)
  // For public channels, assume membership if needed later, history will fail if not.
  // For private channels, is_member should be accurate.
  const memberChannels = allChannels.filter(
    (c) => c.is_member || !c.is_private
  );

  if (memberChannels.length === 0) {
    throw new Error(
      "The bot doesn't appear to be a member of any relevant channels."
    );
  }

  console.log('\nPlease select a channel:');
  const displayChannels = memberChannels.map((channel, index) => {
    const type = channel.is_private ? 'Private' : 'Public';
    const memberCount = channel.num_members || 'N/A'; // num_members might not be present
    console.log(
      `  ${index + 1}: [${type}] ${channel.name} (${channel.id}) - Members: ${memberCount}`
    );
    return channel; // Return the channel object for easy lookup
  });

  const selectionStr = await askQuestion('Enter the number of the channel: ');
  const selectionIndex = parseInt(selectionStr, 10) - 1;

  if (
    Number.isNaN(selectionIndex) ||
    selectionIndex < 0 ||
    selectionIndex >= displayChannels.length
  ) {
    throw new Error('Invalid channel selection number.');
  }

  const selectedChannel = displayChannels[selectionIndex];
  console.log(
    `Selected channel: ${selectedChannel.name} (${selectedChannel.id})`
  );
  return selectedChannel.id;
}

// Placeholder for user message fetching
async function fetchUserMessages(client, userId, limit) {
  console.log('Fetching user messages via search (oldest first)...');
  const allMessages = [];
  let currentPage = 1;
  let totalFetched = 0;
  const fetchBatchSize = Math.min(100, limit); // Max 100 for search

  try {
    while (totalFetched < limit) {
      console.log(
        `Fetching user message page ${currentPage} (batch size: ${fetchBatchSize})...`
      );
      const remainingNeeded = limit - totalFetched;
      const countForThisPage = Math.min(fetchBatchSize, remainingNeeded);

      // eslint-disable-next-line no-await-in-loop
      const searchResult = await client.search.messages({
        query: `from:<@${userId}>`,
        count: countForThisPage,
        sort: 'timestamp',
        sort_dir: 'desc',
        page: currentPage,
      });

      if (searchResult.ok && searchResult.messages?.matches) {
        const { matches, paging } = searchResult.messages;
        // Need to extract the message object from the match
        const messagesFromMatches = matches.map(
          (match) => match.previous || match
        ); // Prefer 'previous' if available for context, else the match itself
        allMessages.push(...messagesFromMatches);
        totalFetched += messagesFromMatches.length;

        console.log(
          `Fetched ${messagesFromMatches.length} messages this page. Total fetched: ${totalFetched}`
        );

        if (
          totalFetched >= limit ||
          !paging ||
          currentPage >= paging.pages ||
          matches.length === 0
        ) {
          console.log('Finished fetching user message pages.');
          break;
        }
        currentPage += 1;
      } else {
        console.error(
          `User message search failed on page ${currentPage}:`,
          searchResult.error || 'No matches found'
        );
        break;
      }
      // Avoid rate limits
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    console.log(
      `Finished user message search. Total retrieved: ${totalFetched} (requested ${limit}).`
    );
    return allMessages;
  } catch (error) {
    console.error('Error during Slack search API call:', error);
    throw new Error('Could not retrieve user messages from Slack.');
  }
}

// Placeholder for channel message fetching
async function fetchChannelMessages(client, channelId, limit) {
  console.log('Fetching channel messages via history (newest first)...');
  const allMessages = [];
  let cursor;
  let totalFetched = 0;
  const fetchBatchSize = Math.min(100, limit); // Max 1000 for history, but 100 is safer

  try {
    while (totalFetched < limit) {
      console.log(
        `Fetching channel message page (batch size: ${fetchBatchSize})...`
      );
      const remainingNeeded = limit - totalFetched;
      const countForThisPage = Math.min(fetchBatchSize, remainingNeeded);

      // eslint-disable-next-line no-await-in-loop
      const response = await client.conversations.history({
        channel: channelId,
        limit: countForThisPage,
        cursor,
        // oldest: // Can specify time range if needed
      });

      if (!response.ok) {
        throw new Error(`Slack API error fetching history: ${response.error}`);
      }

      if (response.messages) {
        allMessages.push(...response.messages);
        totalFetched += response.messages.length;
        console.log(
          `Fetched ${response.messages.length} messages this page. Total fetched: ${totalFetched}`
        );
      } else {
        console.log('No messages found on this page.');
      }

      cursor = response.response_metadata?.next_cursor;

      if (totalFetched >= limit || !response.has_more || !cursor) {
        console.log('Finished fetching channel message pages.');
        break;
      }

      // Avoid rate limits - Increase delay further for safer Tier 3 usage
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 5100));
    }
    console.log(
      `Finished channel history fetch. Total retrieved: ${totalFetched} (requested ${limit}).`
    );
    // Remember: Messages are newest-first here. Reversal happens in main().
    return allMessages;
  } catch (error) {
    console.error('Failed to fetch channel history:', error);
    throw new Error('Could not retrieve channel history from Slack.');
  }
}

// Placeholder for formatting and saving
async function formatAndSaveMessages(messages, type, id) {
  console.log(`Formatting and saving ${messages.length} messages...`);

  const formattedLines = messages.map((msg) => {
    const timestamp = msg.ts
      ? new Date(parseFloat(msg.ts) * 1000).toISOString()
      : '[No Timestamp]';
    // Determine sender: user ID, bot ID, or fallback
    let sender = 'Unknown';
    if (msg.user) {
      sender = `<@${msg.user}>`;
    } else if (msg.bot_id) {
      sender = `Bot <@${msg.bot_id}>`; // Identify bots clearly
    } else if (msg.username) {
      // Some bot messages might use username instead of bot_id
      sender = `${msg.username} (Bot)`;
    }
    const text = msg.text || ''; // Handle potentially missing text

    // Clean up text slightly (basic newline and tab handling)
    const cleanedText = text.replace(/\n/g, '\\n').replace(/\t/g, '\\t');

    return `[${timestamp}] ${sender}: ${cleanedText}`;
  });

  const fileContent = formattedLines.join('\n');

  try {
    const outputDirPath = path.join(__dirname, OUTPUT_DIR);
    await fsPromises.mkdir(outputDirPath, { recursive: true });
    console.log(`Ensured output directory exists: ${outputDirPath}`);

    const timestampSuffix = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFilename = `fetched-messages-${type}-${id}-${timestampSuffix}.txt`;
    const outputPath = path.join(outputDirPath, outputFilename);

    await fsPromises.writeFile(outputPath, fileContent);
    console.log(
      `Successfully wrote ${formattedLines.length} messages to ${outputPath}.`
    );
  } catch (error) {
    console.error('Error writing output file:', error);
    // Don't re-throw here, just log it. Main function handles exit.
  }
}

// --- Main Execution Logic --- //
async function main() {
  let fetchType = '';
  let targetId = ''; // Will store User ID or Channel ID
  let numberOfMessages = 0;
  let messages = [];

  const slackClient = new WebClient(botToken);

  try {
    // 1. Determine Fetch Type
    fetchType = (await askQuestion('Fetch messages by [user] or [channel]? '))
      ?.toLowerCase()
      .trim();
    if (fetchType !== 'user' && fetchType !== 'channel') {
      throw new Error("Invalid fetch type. Please enter 'user' or 'channel'.");
    }

    // 2. Get Target ID and Number of Messages
    const numMessagesStr = await askQuestion(
      'How many messages do you want to fetch? '
    );
    numberOfMessages = parseInt(numMessagesStr, 10);
    if (Number.isNaN(numberOfMessages) || numberOfMessages <= 0) {
      throw new Error(
        'Invalid number of messages provided. Please enter a positive integer.'
      );
    }

    if (fetchType === 'user') {
      targetId = await promptForUserId();
      console.log(
        `Fetching up to ${numberOfMessages} messages from user ID: ${targetId}...`
      );
      messages = await fetchUserMessages(
        slackClient,
        targetId,
        numberOfMessages
      );
    } else {
      // fetchType === 'channel'
      targetId = await selectChannel(slackClient);
      console.log(
        `Fetching up to ${numberOfMessages} messages from channel ID: ${targetId}...`
      );
      messages = await fetchChannelMessages(
        slackClient,
        targetId,
        numberOfMessages
      );
    }

    // 3. Format and Save Messages
    if (messages.length > 0) {
      await formatAndSaveMessages(messages, fetchType, targetId);
    } else {
      console.log('No messages found to save.');
    }
  } catch (err) {
    console.error(`Script Error: ${err.message}`);
    console.error(err.stack); // Log stack trace for debugging
    process.exitCode = 1; // Indicate failure
  } finally {
    rl.close(); // Ensure readline interface is closed
  }
}

// Original fetch function removed/replaced by the above structure
// async function fetchAndSaveMessages() { ... }

// --- Run the script --- //
main().catch((error) => {
  // Catch unhandled promise rejections from main
  console.error('Script failed unexpectedly in main:', error);
  if (rl && !rl.closed) rl.close();
  process.exit(1);
});
