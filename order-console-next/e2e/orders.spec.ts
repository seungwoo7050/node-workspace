import { test, expect } from "@playwright/test";

test("주문 목록에서 상세로 이동한다", async ({ page }) => {
  await page.goto("/orders");
  await page.getByRole("link", { name: /101.*kim/ }).click();
  await expect(page.getByRole("heading", { name: /101.*kim/ })).toBeVisible();
});