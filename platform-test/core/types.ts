/**
 * Platform Test Core Types
 *
 * Universal type definitions for cross-platform testing.
 * These types are designed to be platform-agnostic.
 */

/**
 * Discovered element type classification
 */
export type ElementType =
  | 'button'
  | 'link'
  | 'form'
  | 'input'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'file-upload'
  | 'date-picker'
  | 'modal'
  | 'dialog'
  | 'dropdown'
  | 'menu'
  | 'tab'
  | 'accordion'
  | 'carousel'
  | 'tooltip'
  | 'toast'
  | 'other';

/**
 * Input field classification for smart form filling
 */
export type InputFieldType =
  | 'email'
  | 'password'
  | 'text'
  | 'name'
  | 'first-name'
  | 'last-name'
  | 'full-name'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'country'
  | 'company'
  | 'url'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime'
  | 'credit-card'
  | 'cvv'
  | 'expiry'
  | 'search'
  | 'message'
  | 'description'
  | 'unknown';

/**
 * Locator strategy with fallbacks
 */
export interface SmartLocator {
  primary: string;
  fallbacks: string[];
  type: 'role' | 'text' | 'testid' | 'label' | 'css' | 'xpath';
  confidence: number;
  description: string;
}

/**
 * Discovered element with metadata
 */
export interface DiscoveredElement {
  id: string;
  type: ElementType;
  locators: SmartLocator;
  text?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  value?: string;
  href?: string;
  isVisible: boolean;
  isEnabled: boolean;
  isRequired: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Record<string, string>;
  parentForm?: string;
  inputType?: InputFieldType;
  validationRules?: ValidationRule[];
  screenshot?: string;
  timestamp: number;
}

/**
 * Validation rule for form fields
 */
export interface ValidationRule {
  type: 'required' | 'pattern' | 'minLength' | 'maxLength' | 'min' | 'max' | 'email' | 'url' | 'custom';
  value?: string | number;
  message?: string;
}

/**
 * Discovered form with all fields
 */
export interface DiscoveredForm {
  id: string;
  name?: string;
  action?: string;
  method?: string;
  locator: SmartLocator;
  fields: DiscoveredElement[];
  submitButton?: DiscoveredElement;
  cancelButton?: DiscoveredElement;
  isMultiStep: boolean;
  steps?: FormStep[];
  validationErrors: string[];
  timestamp: number;
}

/**
 * Multi-step form step
 */
export interface FormStep {
  stepNumber: number;
  name?: string;
  fields: DiscoveredElement[];
  nextButton?: DiscoveredElement;
  backButton?: DiscoveredElement;
}

/**
 * Discovered page with all elements
 */
export interface DiscoveredPage {
  url: string;
  path: string;
  title: string;
  description?: string;
  isAuthenticated: boolean;
  forms: DiscoveredForm[];
  buttons: DiscoveredElement[];
  links: DiscoveredElement[];
  modals: DiscoveredElement[];
  navigation: NavigationItem[];
  headings: { level: number; text: string }[];
  timestamp: number;
  screenshot?: string;
  loadTime: number;
}

/**
 * Navigation item
 */
export interface NavigationItem {
  text: string;
  href: string;
  locator: SmartLocator;
  children?: NavigationItem[];
}

/**
 * User flow / journey
 */
export interface UserFlow {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  preconditions: FlowPrecondition[];
  expectedOutcome: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
}

/**
 * Single step in a user flow
 */
export interface FlowStep {
  stepNumber: number;
  action: ActionType;
  target: SmartLocator;
  value?: string;
  description: string;
  assertions?: Assertion[];
  waitFor?: WaitCondition;
  screenshot?: boolean;
}

/**
 * Action type for flow steps
 */
export type ActionType =
  | 'click'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'focus'
  | 'blur'
  | 'press'
  | 'upload'
  | 'scroll'
  | 'navigate'
  | 'wait'
  | 'assert'
  | 'screenshot';

/**
 * Precondition for a flow
 */
export interface FlowPrecondition {
  type: 'authenticated' | 'page' | 'element' | 'data' | 'custom';
  value: string;
  description: string;
}

/**
 * Assertion for validating state
 */
export interface Assertion {
  type: 'visible' | 'hidden' | 'text' | 'value' | 'attribute' | 'url' | 'title' | 'count' | 'enabled' | 'disabled';
  target?: SmartLocator;
  expected: string | number | boolean;
  timeout?: number;
}

/**
 * Wait condition
 */
export interface WaitCondition {
  type: 'visible' | 'hidden' | 'navigation' | 'networkidle' | 'timeout' | 'selector';
  value?: string | number;
}

/**
 * Discovery report
 */
export interface DiscoveryReport {
  appName: string;
  baseUrl: string;
  startedAt: number;
  completedAt: number;
  duration: number;
  pages: DiscoveredPage[];
  totalElements: {
    forms: number;
    buttons: number;
    links: number;
    inputs: number;
    modals: number;
  };
  suggestedFlows: UserFlow[];
  errors: DiscoveryError[];
  coverage: {
    pagesVisited: number;
    formsFound: number;
    interactiveElements: number;
  };
}

/**
 * Discovery error
 */
export interface DiscoveryError {
  type: 'navigation' | 'timeout' | 'element' | 'auth' | 'unknown';
  message: string;
  page?: string;
  element?: string;
  timestamp: number;
}

/**
 * Test case generated from discovery
 */
export interface GeneratedTest {
  id: string;
  name: string;
  description: string;
  flow: UserFlow;
  code: string;
  filePath: string;
  estimatedDuration: number;
  dependencies: string[];
}

/**
 * Test result
 */
export interface TestResult {
  testId: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  duration: number;
  startedAt: number;
  completedAt: number;
  error?: {
    message: string;
    stack?: string;
    screenshot?: string;
  };
  steps: StepResult[];
  retries: number;
}

/**
 * Step result
 */
export interface StepResult {
  stepNumber: number;
  action: ActionType;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  screenshot?: string;
  healedLocator?: SmartLocator;
}

/**
 * Test run summary
 */
export interface TestRunSummary {
  runId: string;
  appName: string;
  startedAt: number;
  completedAt: number;
  duration: number;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
  };
  coverage: {
    pages: number;
    forms: number;
    buttons: number;
    flows: number;
  };
}

/**
 * Element selector strategies
 */
export const SELECTOR_STRATEGIES = [
  'role',
  'text',
  'testid',
  'label',
  'placeholder',
  'alt',
  'title',
  'css',
  'xpath',
] as const;

/**
 * Default form field patterns for classification
 */
export const FIELD_PATTERNS: Record<InputFieldType, RegExp[]> = {
  email: [/email/i, /e-mail/i, /mail/i],
  password: [/password/i, /passwd/i, /pass/i, /pwd/i],
  'first-name': [/first.?name/i, /fname/i, /given.?name/i, /forename/i],
  'last-name': [/last.?name/i, /lname/i, /surname/i, /family.?name/i],
  'full-name': [/full.?name/i, /name/i, /your.?name/i],
  name: [/^name$/i],
  phone: [/phone/i, /tel/i, /mobile/i, /cell/i],
  address: [/address/i, /street/i, /addr/i, /line1/i],
  city: [/city/i, /town/i, /locality/i],
  state: [/state/i, /province/i, /region/i],
  zip: [/zip/i, /postal/i, /postcode/i],
  country: [/country/i, /nation/i],
  company: [/company/i, /organization/i, /org/i, /business/i],
  url: [/url/i, /website/i, /site/i, /link/i],
  number: [/number/i, /amount/i, /quantity/i, /qty/i],
  date: [/date/i, /dob/i, /birth/i],
  time: [/time/i],
  datetime: [/datetime/i],
  'credit-card': [/card.?number/i, /cc.?num/i, /credit/i],
  cvv: [/cvv/i, /cvc/i, /security.?code/i],
  expiry: [/expir/i, /exp.?date/i, /valid/i],
  search: [/search/i, /query/i, /find/i],
  message: [/message/i, /comment/i, /note/i],
  description: [/description/i, /desc/i, /details/i, /bio/i],
  text: [/.*/], // Catch-all
  unknown: [],
};
