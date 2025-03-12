# Implementing Fresh Testing Infrastructure

This document outlines a clear, step-by-step plan to set up a robust, maintainable, and effective testing infrastructure for Clarity smart contracts using Clarinet and Vitest.

## Step 1: Clean Slate

- Delete all existing test files in the `tests/` directory.
- Remove existing Vitest configuration files (`vitest.config.js`, `vitest.basic.config.js`).
- Ensure no residual configuration or scripts remain in `package.json` related to testing.

## Step 2: Setup Clarinet Environment

- Verify Clarinet installation:
  ```bash
  clarinet --version
  ```
- Initialize a fresh Clarinet project (if needed):
  ```bash
  clarinet new stacks-microtask
  ```
- Ensure proper network configuration files (`Devnet.toml`, `Testnet.toml`, `Mainnet.toml`) are correctly set up in the `settings/` directory.

## Step 3: Install and Configure Vitest

- Install Vitest and necessary dependencies:
  ```bash
  npm install vitest @hirosystems/clarinet-sdk --save-dev
  ```
- Create a fresh Vitest configuration file (`vitest.config.js`):

  ```javascript
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    test: {
      globals: true,
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
    },
  });
  ```

## Step 4: Write Initial Test Setup

- Create a `setup.ts` file in the `tests/` directory to initialize Clarinet:

  ```typescript
  import { Clarinet, Tx, Chain, Account } from "@hirosystems/clarinet-sdk";

  export const setup = () => {
    const chain = new Chain();
    const accounts = Clarinet.getAccounts();
    return { chain, accounts };
  };
  ```

## Step 5: Write Basic Tests

- Create a new test file `microtasks.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { setup } from "./setup";

  describe("Microtasks Contract", () => {
    it("should post a task successfully", () => {
      const { chain, accounts } = setup();
      const deployer = accounts.get("deployer")!;

      const block = chain.mineBlock([
        Tx.contractCall(
          "microtasks",
          "post-task",
          ['"Test Task"', "u100"],
          deployer.address
        ),
      ]);

      expect(block.receipts[0].result).toBeOk("u0");
    });
  });
  ```

## Step 6: Run and Verify Tests

- Run tests to verify setup:
  ```bash
  npm run test
  ```
- Ensure tests pass and coverage reports are generated correctly.

## Step 7: Continuous Integration

- Set up GitHub Actions or another CI/CD pipeline to automatically run tests on each commit.

## Step 8: Documentation and Maintenance

- Document testing procedures clearly in the project README.
- Regularly update tests to cover new features and edge cases.

By following this structured approach, we ensure a clean, maintainable, and robust testing infrastructure for our Clarity smart contracts.
