import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  page: Page;
  emailInput: Locator;
  passwordInput: Locator;
  submitButton: Locator;
  errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[data-testid="error"], .error-message');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async isErrorDisplayed(): Promise<boolean> {
    return this.errorMessage.isVisible();
  }

  async getErrorText(): Promise<string> {
    return (await this.errorMessage.textContent()) ?? '';
  }
}

export class DashboardPage {
  page: Page;
  heading: Locator;
  userMenu: Locator;
  logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1, h2');
    this.userMenu = page.locator('[data-testid="user-menu"]');
    this.logoutButton = page.locator('button:has-text("Logout")');
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  async isLoggedIn(): Promise<boolean> {
    return this.userMenu.isVisible();
  }

  async logout() {
    await this.userMenu.click();
    await this.logoutButton.click();
  }
}

export class SimulatorPage {
  page: Page;
  candidateNameInput: Locator;
  analyzeButton: Locator;
  resultContainer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.candidateNameInput = page
      .locator('input[placeholder*="Name"], input[name*="name"]')
      .first();
    this.analyzeButton = page
      .locator('button:has-text("Analyze"), button:has-text("Simular")')
      .first();
    this.resultContainer = page.locator('[data-testid="result"], .result');
  }

  async goto() {
    await this.page.goto('/simulator');
  }

  async simulateCandidateProfile(name: string) {
    await this.candidateNameInput.fill(name);
    await this.analyzeButton.click();
    await this.page.waitForTimeout(1000);
  }

  async hasResults(): Promise<boolean> {
    return this.resultContainer.isVisible({ timeout: 5000 }).catch(() => false);
  }
}

export class LeadCapturePage {
  page: Page;
  emailInput: Locator;
  phoneInput: Locator;
  submitButton: Locator;
  successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.phoneInput = page.locator(
      'input[type="tel"], input[placeholder*="phone"]',
    );
    this.submitButton = page.locator('button[type="submit"]');
    this.successMessage = page.locator(
      '[data-testid="success"], .success-message',
    );
  }

  async goto() {
    await this.page.goto('/contact');
  }

  async submitLead(email: string, phone: string) {
    await this.emailInput.fill(email);
    if (await this.phoneInput.isVisible()) {
      await this.phoneInput.fill(phone);
    }
    await this.submitButton.click();
  }

  async isSuccessDisplayed(): Promise<boolean> {
    return this.successMessage.isVisible({ timeout: 5000 }).catch(() => false);
  }
}
