import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("주문 목록 페이지는 심각한 접근성 위반이 없다", async ({ page }) => {
  await page.goto("/orders");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});