/**
 * Automated content quality checks to prevent hallucinations and errors
 */

export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-100
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
    severity: "error" | "warning" | "info";
  }>;
}

export class QualityCheckService {
  /**
   * Comprehensive quality checks for generated lessons
   */
  static checkLessonQuality(lesson: {
    content?: string;
    keyTakeaways?: string[];
    examFocusPoints?: string[];
  }): QualityCheckResult {
    const checks: QualityCheckResult["checks"] = [];

    // Content length check
    const contentLength = lesson.content ? JSON.stringify(lesson.content).length : 0;
    if (contentLength < 200) {
      checks.push({
        name: "Content Length",
        passed: false,
        message: "Lesson content is too short (< 200 chars)",
        severity: "warning",
      });
    } else {
      checks.push({
        name: "Content Length",
        passed: true,
        message: `Adequate length: ${contentLength} chars`,
        severity: "info",
      });
    }

    // Key takeaways check
    if (!lesson.keyTakeaways || lesson.keyTakeaways.length < 2) {
      checks.push({
        name: "Key Takeaways",
        passed: false,
        message: "Missing key takeaways (need at least 2)",
        severity: "warning",
      });
    } else {
      checks.push({
        name: "Key Takeaways",
        passed: true,
        message: `${lesson.keyTakeaways.length} takeaways present`,
        severity: "info",
      });
    }

    // Exam focus points check
    if (!lesson.examFocusPoints || lesson.examFocusPoints.length < 1) {
      checks.push({
        name: "Exam Focus Points",
        passed: false,
        message: "Missing exam focus points",
        severity: "warning",
      });
    } else {
      checks.push({
        name: "Exam Focus Points",
        passed: true,
        message: `${lesson.examFocusPoints.length} focus points present`,
        severity: "info",
      });
    }

    // Check for common hallucination patterns
    const contentStr = lesson.content ? JSON.stringify(lesson.content).toLowerCase() : "";
    const hallucinations = this.detectPotentialHallucinations(contentStr);
    if (hallucinations.length > 0) {
      checks.push({
        name: "Hallucination Detection",
        passed: false,
        message: `Potential hallucinations detected: ${hallucinations.join(", ")}`,
        severity: "error",
      });
    } else {
      checks.push({
        name: "Hallucination Detection",
        passed: true,
        message: "No obvious hallucinations detected",
        severity: "info",
      });
    }

    const passed = checks.filter((c) => c.severity === "error").length === 0;
    const score = Math.max(0, 100 - checks.filter((c) => !c.passed).length * 20);

    return { passed, score, checks };
  }

  /**
   * Comprehensive quality checks for generated questions
   */
  static checkQuestionQuality(question: {
    question?: string;
    options?: Array<{ text?: string; isCorrect?: boolean }>;
    explanation?: string;
    difficulty?: string;
  }): QualityCheckResult {
    const checks: QualityCheckResult["checks"] = [];

    // Question text check
    const questionLength = question.question ? JSON.stringify(question.question).length : 0;
    if (questionLength < 50) {
      checks.push({
        name: "Question Text",
        passed: false,
        message: "Question is too short (< 50 chars)",
        severity: "error",
      });
    } else {
      checks.push({
        name: "Question Text",
        passed: true,
        message: "Question is adequately detailed",
        severity: "info",
      });
    }

    // Options check
    if (!question.options || question.options.length !== 4) {
      checks.push({
        name: "Option Count",
        passed: false,
        message: `Should have 4 options, has ${question.options?.length || 0}`,
        severity: "error",
      });
    } else {
      // Check option text length
      const shortOptions = question.options.filter(
        (o) => !o.text || JSON.stringify(o.text).length < 20,
      );
      if (shortOptions.length > 0) {
        checks.push({
          name: "Option Quality",
          passed: false,
          message: `${shortOptions.length} options are too short`,
          severity: "warning",
        });
      } else {
        checks.push({
          name: "Option Quality",
          passed: true,
          message: "All options are adequately detailed",
          severity: "info",
        });
      }
    }

    // Correct answer check
    const correctOptions = question.options?.filter((o) => o.isCorrect) || [];
    if (correctOptions.length !== 1) {
      checks.push({
        name: "Correct Answer",
        passed: false,
        message: `Should have exactly 1 correct answer, has ${correctOptions.length}`,
        severity: "error",
      });
    } else {
      checks.push({
        name: "Correct Answer",
        passed: true,
        message: "Exactly one correct answer",
        severity: "info",
      });
    }

    // Explanation check
    const explanationLength = question.explanation
      ? JSON.stringify(question.explanation).length
      : 0;
    if (explanationLength < 50) {
      checks.push({
        name: "Explanation",
        passed: false,
        message: "Explanation is too short",
        severity: "warning",
      });
    } else {
      checks.push({
        name: "Explanation",
        passed: true,
        message: "Explanation is detailed",
        severity: "info",
      });
    }

    const passed = checks.filter((c) => c.severity === "error").length === 0;
    const score = Math.max(0, 100 - checks.filter((c) => !c.passed).length * 20);

    return { passed, score, checks };
  }

  /**
   * Detects common hallucination patterns in AI-generated content
   */
  private static detectPotentialHallucinations(content: string): string[] {
    const patterns = [
      { regex: /fictitious.*company|made.?up.*company/i, name: "Fictional company reference" },
      { regex: /i don't.*know|i'm not.*sure|unclear|uncertain/i, name: "Uncertainty language" },
      { regex: /presumably|supposedly|allegedly/i, name: "Unverified claims" },
      { regex: /in my opinion|i believe|i think/i, name: "Opinion language" },
    ];

    const detected: string[] = [];
    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        detected.push(pattern.name);
      }
    }
    return detected;
  }

  /**
   * Checks for duplicate content
   */
  static checkForDuplicates(
    content: string,
    otherContents: string[],
    threshold: number = 0.85,
  ): {
    isDuplicate: boolean;
    similarity: number;
    duplicateOf?: string;
  } {
    // Simple similarity check using token overlap
    const contentTokens = this.tokenize(content);

    for (const other of otherContents) {
      const otherTokens = this.tokenize(other);
      const similarity = this.calculateSimilarity(contentTokens, otherTokens);

      if (similarity >= threshold) {
        return {
          isDuplicate: true,
          similarity: Math.round(similarity * 100),
          duplicateOf: other.substring(0, 100),
        };
      }
    }

    return {
      isDuplicate: false,
      similarity: 0,
    };
  }

  private static tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length > 3),
    );
  }

  private static calculateSimilarity(tokens1: Set<string>, tokens2: Set<string>): number {
    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    return intersection.size / union.size;
  }
}
