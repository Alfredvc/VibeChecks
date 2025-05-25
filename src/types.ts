export interface LintMessage {
    line: number | null;
    message: string;
}

export interface CheckResult {
    passed: boolean;
    errors: (string | LintMessage)[];
    warnings: (string | LintMessage)[];
}