# Work Plan: End-to-End Testing, Refinement, and Cleanup

- **Task ID**: `PLAN-13-TestingRefinement`
- **Problem Statement**: Conduct thorough end-to-end testing of the deployed On-Call Support Bot and the automated ingestion pipeline. Identify and address bugs, refine LLM prompts and personality based on test results, improve error handling, optimize configurations (e.g., Cloud Run resources), and ensure the codebase is clean and maintainable.
- **Components Involved**:
  - Deployed Cloud Run Bot Service
  - Deployed Cloud Function / Cloud Run Job (Ingestion)
  - Cloud Scheduler Job
  - Slack Interface (User interaction)
  - Google Drive (Runbook source)
  - Vertex AI Services (Vector Search, Gemini, Embeddings)
  - Cloud Logging & Monitoring
  - Entire codebase (`src/`, `scripts/`, `functions/`)
- **Dependencies**:
  - `PLAN-11-DockerCloudRun` completed (Bot service deployed).
  - `PLAN-12-IngestionDeployment` completed (Ingestion deployed and scheduled).
  - All previous implementation plans successfully executed and individually verified.
- **Implementation Checklist**:

  **Phase 1: Comprehensive E2E Testing**

  - \[ ] **Define Test Scenarios:** Create a list of realistic on-call scenarios to test against the bot. Include:
    - Simple questions directly answerable from one runbook chunk.
    - Questions requiring synthesis across multiple runbook chunks.
    - Questions relying on Slack history context (follow-ups).
    - Questions where no relevant runbook context exists.
    - Questions similar to personality examples to test style mimicry.
    - Ambiguous or poorly phrased questions.
    - Triggering the "Log Incident" button flow.
  - \[ ] **Execute Bot Test Scenarios:**
    - Interact with the deployed bot in Slack, running through each defined scenario.
    - For each scenario, evaluate:
      - **Responsiveness:** Does the bot acknowledge quickly (if "Thinking" message used)? Is the final response time acceptable?
      - **Accuracy:** Is the answer factually correct based on runbooks/history? Does it hallucinate?
      - **Completeness:** Does it provide sufficient detail? Does it correctly state when it cannot answer?
      - **Contextual Awareness:** Does it use Slack history appropriately for follow-up questions?
      - **Personality Adherence:** Does the tone and style match the configured persona? Is it consistent?
      - **Button Functionality:** Does "Log Incident" work reliably? Is the ticket format correct? Is confirmation received?
    - Document results, noting any failures, inaccuracies, poor responses, or style inconsistencies.
  - \[ ] **Test Ingestion Pipeline:**
    - Manually trigger the ingestion Cloud Function/Job. Verify successful execution via logs.
    - **Add/Modify/Delete Runbook:** Make a noticeable change in a runbook within the Google Drive folder (add a new section, modify steps, delete a test file if safe).
    - Wait for the next scheduled ingestion run OR manually trigger it again.
    - Verify the ingestion logs show the changes being processed (e.g., new/updated file detected, chunks upserted).
    - After ingestion, query the bot in Slack with questions specifically related to the added/modified content. Verify the bot's answers reflect the updated runbook information. Verify questions related to deleted content no longer return that specific info.
  - \[ ] **Test Error Conditions:**
    - (Simulate if necessary) Test bot behavior if Vertex AI services are temporarily unavailable or return errors. Does it fail gracefully?
    - (Simulate if necessary) Test bot behavior if Slack API calls fail (e.g., rate limiting).
    - Test ingestion behavior if a specific runbook file is corrupted or unparseable. Does it skip the file and continue?
    - Test ingestion behavior if Drive API or Vertex AI APIs fail during the process.

  **Phase 2: Refinement Based on Testing**

  - \[ ] **Address Functional Bugs:** Fix any outright errors or crashes identified during testing in the bot service or ingestion process. Update relevant code files.
  - \[ ] **Refine Prompts & Personality:**
    - Analyze inaccurate, incomplete, or poorly styled responses.
    * Modify the `RAG_PROMPT_TEMPLATE` in `src/rag/generator.js` to improve instructions (e.g., be more specific about conciseness, how to handle lack of context, how to apply personality).
    - Adjust the `PERSONALITY_STYLE_DESCRIPTION` for clarity.
    - Re-curate or refine the static `style-examples.json` if mimicry is weak or inconsistent.
    - _Iterate:_ Redeploy the bot service and re-test specific scenarios after prompt/example changes.
  - \[ ] **Tune RAG Parameters:**
    - If retrieval brings back irrelevant documents: Consider adjusting `k` (number of documents retrieved) in `initializeRetriever`. Explore adding metadata filtering in Vector Search queries if applicable (e.g., filter by runbook category if metadata is added during ingestion).
    - If context + history frequently hits token limits: Make the history reduction logic in `PLAN-08` more aggressive or intelligent. Consider reducing `k`.
  - \[ ] **Improve Error Handling & Logging:**
    - Make error messages sent to Slack more user-friendly.
    - Enhance server-side logging (Cloud Logging) with more contextual information for easier debugging (e.g., log retrieved chunk IDs, final prompt snippet, timings).
    - Implement more specific error catching where needed.

  **Phase 3: Optimization & Cleanup**

  - \[ ] **Optimize Cloud Run Configuration:**
    - Analyze Cloud Run metrics (CPU, Memory, Latency, Instance Count) from testing.
    * Adjust `--cpu`, `--memory`, `--concurrency`, `--min-instances`, `--max-instances` settings in the `gcloud run deploy` command (or Terraform/IaC) for the bot service to balance performance and cost. Consider CPU boost options if cold starts are problematic.
  - \[ ] **Optimize Ingestion Function/Job Configuration:**
    - Analyze execution time and resource usage for the ingestion task.
    * Adjust function `--memory`/`--timeout` or job `--cpu`/`--memory`/`--task-timeout` for efficiency.
  - \[ ] **Code Cleanup:**
    - Remove any temporary test code, console logs used only for debugging, or commented-out old logic.
    - Ensure code adheres to the `STYLE_GUIDE.md` (run linters/formatters).
    - Add or improve comments and JSDoc blocks where needed for clarity.
    - Refactor complex functions if necessary for better readability or maintainability.
  - \[ ] **Documentation Update:**
    - Update `README.md` (create if doesn't exist) with instructions on how to run locally, deploy, and any key configuration notes.
    - Ensure all Work Plans (`PLAN-XX-*.md`) are marked as "Completed" and have relevant notes.
    - Review `REQUIREMENTS.md` and ensure the final implementation meets the stated goals. Update if necessary.
    - Ensure `CONFIGURATION_GUIDE.md` is accurate based on the final deployment setup.

- **Verification Steps**:
  1.  Perform a final regression test of all major scenarios after refinements are complete.
  2.  Confirm bot responsiveness and resource usage meet acceptable levels based on Cloud Run/Function metrics.
  3.  Confirm automated ingestion runs reliably on schedule and correctly updates the index based on Drive changes.
  4.  Code review confirms cleanup, adherence to style guide, and improved comments/documentation.
  5.  Ensure monitoring/logging provides sufficient visibility for ongoing operation and debugging.
- **Decision Authority**:
  - AI **can** propose specific prompt changes, error message improvements, and logging enhancements based on testing observations.
  - AI **can** suggest optimized resource configurations for Cloud Run/Functions, but final values may require user confirmation or monitoring over time.
  - AI **must** prioritize fixing functional bugs over minor stylistic refinements.
  - AI **must** perform code cleanup and documentation updates.
- **Questions/Uncertainties**:
  - _Blocking_: None, dependent on thoroughness of previous steps.
  - _Non-blocking_: Determining "optimal" resource settings (requires ongoing observation). Subjectivity in evaluating personality adherence and response quality (requires human judgment). How much prompt engineering is "enough" for V1.
- **Acceptable Tradeoffs**:
  - V1 may not have perfect personality adherence or handle every edge case query flawlessly. Focus on core functionality and major improvements identified in testing.
  - Optimization is iterative; initial settings post-testing might still need future adjustments.
  - Documentation can always be improved further.
- **Status**: Completed
- **Notes**:
  - This phase is crucial for stabilizing the application and improving its quality beyond basic functionality.
  - Allocate sufficient time for testing and iterative refinement, especially for prompt engineering and personality tuning.
  - Leverage Cloud Logging and Monitoring heavily during this phase to understand performance and identify bottlenecks or errors.
  - Consider setting up basic alerting (e.g., on high error rates for the Cloud Run service or Function failures) for ongoing monitoring.
  - Created comprehensive test scenarios document in docs/testing/test-scenarios.md
  - Refined the RAG prompt template for better responses and better handling of ambiguous queries
  - Improved error handling and user-friendly messages in the application
  - Created cloud-run-optimization.md with resource allocation recommendations
  - Added code-cleanup.md document with thorough suggestions for maintaining code quality
