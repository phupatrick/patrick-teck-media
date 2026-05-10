import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSellerService } from "../src/seller-service.mjs";
import { executeSellerCommand } from "../src/telegram-seller-bot.mjs";
import { createSellerTranslator } from "../src/seller-translation.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-media-seller-"));
const statePath = path.join(tempDir, "seller-catalog.json");
const service = createSellerService({
  statePath,
  translator: createSellerTranslator({
    async translate({ targetLanguage, fields }) {
      if (targetLanguage !== "my") {
        return fields;
      }

      return {
        name: `MY ${fields.name}`,
        description: `MY ${fields.description}`,
        duration_label: `MY ${fields.duration_label}`,
        warranty_label: `MY ${fields.warranty_label}`
      };
    }
  })
});
await service.ensureDefaultCategories();
const temporaryFutureDate = "2030-04-20";

function buildContext(overrides = {}) {
  return {
    service,
    actor: "@patrick",
    userId: "7481176582",
    adminUserIds: new Set(["7481176582"]),
    timezoneOffset: "+07:00",
    timezone: "Asia/Saigon",
    ...overrides
  };
}

const tests = [
  {
    name: "creates layered categories and products through admin commands",
    async run() {
      const categoryReply = await executeSellerCommand("/addcat Tep GPT", buildContext());
      assert.match(categoryReply.text, /Tep GPT/);

      const category = (await service.listCategories({ includeTemporary: true })).find((entry) => entry.name === "Tep GPT");
      assert.ok(category);

      const addReply = await executeSellerCommand(
        `/add ${category.id} | GPT Plus | 1 month | 7 days | 20 | Shared GPT Plus account`,
        buildContext()
      );

      assert.match(addReply.text, /Added/);
      const products = await service.listProducts({ includeTemporary: true });
      const product = products.find((entry) => entry.name === "GPT Plus");
      assert.equal(product.category_name, "Tep GPT");
      assert.equal(product.duration_label, "1 month");
      assert.equal(product.warranty_label, "7 days");
      assert.equal(product.price, 20);
      assert.equal(product.currency, "USD");
      assert.equal(product.name, "GPT Plus");
    }
  },
  {
    name: "supports temporary products that expire automatically",
    async run() {
      const addReply = await executeSellerCommand(
        `/addtemp Gemini Ultra | 1 month | 3 days | 15 | Flash sale account | ${temporaryFutureDate}`,
        buildContext()
      );

      assert.match(addReply.text, /Added temporary/);

      const temporary = (await service.listProducts({ includeTemporary: true })).find((entry) => entry.name === "Gemini Ultra");
      assert.ok(temporary.is_temporary);

      const purged = await service.purgeExpiredTemporaryProducts({
        now: "2030-04-21T00:00:00.000Z",
        actor: "test"
      });
      assert.equal(purged.length, 1);
      assert.equal((await service.getProductById(temporary.id, { now: "2030-04-21T00:00:00.000Z" })), null);
    }
  },
  {
    name: "searches products and updates product content in english",
    async run() {
      const searchReply = await executeSellerCommand("/find GPT", buildContext());

      assert.match(searchReply.text, /Search results/i);
      assert.match(searchReply.text, /GPT Plus/);

      const category = (await service.listCategories({ includeTemporary: true })).find((entry) => entry.name === "Tep GPT");
      const existing = (await service.listProducts({ includeTemporary: true })).find((entry) => entry.category_id === category.id);
      const editReply = await executeSellerCommand(
        `/edit ${existing.id} | name=GPT Pro | duration=1 month | warranty=5 days | desc=Shared GPT Pro account`,
        buildContext()
      );

      assert.match(editReply.text, /Updated/i);
      const updated = await service.getProductById(existing.id, { language: "en" });
      assert.equal(updated.name, "GPT Pro");
      assert.equal(updated.description, "Shared GPT Pro account");
    }
  },
  {
    name: "blocks non-admin catalog modifications while allowing browsing",
    async run() {
      await assert.rejects(
        () =>
          executeSellerCommand(
            "/addcat Tep Gemini",
            buildContext({
              userId: "111",
              adminUserIds: new Set(),
              actor: "@viewer"
            })
          ),
        /Chi admin|Only admins|admin/i
      );

      const helpReply = await executeSellerCommand(
        "/heybot",
        buildContext({
          userId: "111",
          adminUserIds: new Set(),
          actor: "@viewer"
        })
      );

      assert.match(helpReply.text, /heybot/i);
    }
  }
];

let failed = 0;

for (const entry of tests) {
  try {
    await entry.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error.stack || error.message || error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`All ${tests.length} seller checks passed.`);
}
