# On-Call Support Bot Test Scenarios

This document outlines the test scenarios for evaluating the functionality and performance of the Slack On-Call Support Bot.

## Bot Interaction Test Scenarios

### Basic Information Retrieval

1. **Simple Direct Question**

   - Query: "What is the process for restarting the application server?"
   - Expected: Bot should retrieve and summarize the specific restart procedure from runbooks.
   - Evaluation: Accuracy, completeness, response time

2. **Multi-Document Synthesis**
   - Query: "What steps should I take if both the database and application server are down?"
   - Expected: Bot should retrieve and synthesize information from multiple runbook sections.
   - Evaluation: Ability to combine information coherently, logical organization

### Context Awareness

3. **Follow-up Question**

   - Initial Query: "What monitoring tools do we use?"
   - Follow-up: "How do I access the dashboard?"
   - Expected: Bot should understand "dashboard" refers to monitoring tools mentioned previously.
   - Evaluation: Contextual awareness, appropriate use of conversation history

4. **Clarification Request**
   - Query: "How do I fix the error?"
   - Expected: Bot should ask for clarification about which error.
   - Evaluation: Recognition of ambiguity, appropriate follow-up questions

### Edge Cases

5. **Out-of-Scope Question**

   - Query: "What's the weather like today?"
   - Expected: Bot should politely explain it can only help with support-related topics.
   - Evaluation: Boundary recognition, appropriate limitation acknowledgment

6. **Partially Answerable Question**
   - Query: "What's the process for handling customer complaints about API latency?"
   - Expected: If only partial information exists, bot should provide what's available and acknowledge limitations.
   - Evaluation: Partial information handling, transparency

### Personality and Style

7. **Technical Question**

   - Query: "Explain how our authentication system works."
   - Expected: Response should match the defined personality style while remaining technically accurate.
   - Evaluation: Style adherence, consistency with examples

8. **Simple vs. Complex Response**
   - Simple Query: "What port does the application run on?"
   - Complex Query: "Explain the architecture of our microservices."
   - Expected: Bot should adapt detail level and tone appropriately to question complexity.
   - Evaluation: Adaptability of style, appropriate detail level

### Button Interaction

9. **Log Incident Flow**
   - Action: Click "Log Incident" button on a bot response
   - Expected:
     - Button click should be acknowledged quickly
     - Incident should be logged to the ticket channel with proper formatting
     - Confirmation message should appear in the original thread
     - Optional: Reaction should be added to the message
   - Evaluation: Button responsiveness, ticket format correctness, confirmation clarity

## Ingestion Pipeline Testing

10. **Regular Ingestion Run**

    - Action: Manually trigger ingestion function
    - Expected: Successful processing of all documents in the Drive folder
    - Evaluation: Log entries, processing statistics, execution time

11. **Document Addition**

    - Action: Add a new document to the Drive folder with unique content
    - Action: Run ingestion manually
    - Action: Query bot about the new content
    - Expected: Bot should incorporate and retrieve new information
    - Evaluation: Time to availability, accuracy of retrieval

12. **Document Modification**

    - Action: Modify an existing document with significant changes
    - Action: Run ingestion manually
    - Action: Query bot about the modified content
    - Expected: Bot should reflect updated information
    - Evaluation: Update consistency, old vs new information handling

13. **Document Deletion**
    - Action: Remove a document from the Drive folder
    - Action: Run ingestion manually
    - Action: Query bot about the deleted content
    - Expected: Bot should no longer provide that specific information
    - Evaluation: Removal confirmation, response when asked about deleted content

## Error Handling Testing

14. **Invalid Query Handling**

    - Action: Send malformed or extremely long queries
    - Expected: Graceful error handling with helpful response
    - Evaluation: User-friendly error messages, system stability

15. **Service Disruption Handling**

    - Action: Simulate Vertex AI service unavailability (if possible)
    - Expected: Graceful degradation with informative message
    - Evaluation: Error message clarity, recovery mechanism

16. **Ingestion Error Handling**
    - Action: Include a corrupted or unsupported file format in Drive folder
    - Expected: Ingestion should skip problematic file and continue with others
    - Evaluation: Resilience, appropriate error logging, partial success handling

## Results Tracking Template

| Test ID | Date | Tester | Pass/Fail | Notes | Issues Identified | Suggestions |
| ------- | ---- | ------ | --------- | ----- | ----------------- | ----------- |
| 1       |      |        |           |       |                   |             |
| 2       |      |        |           |       |                   |             |
| ...     |      |        |           |       |                   |             |

Use this template to track test results and inform refinement efforts.
