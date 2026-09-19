import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import {
  courseGenerator,
  courseResponseSchema,
  generateCourse,
  type GeneratedCourse,
} from "../src/services/courseGenerator";

vi.mock("@google/genai", () => {
  const generateContentMock = vi.fn();
  const GoogleGenAIMock = vi.fn().mockImplementation(() => ({
    models: {
      generateContent: generateContentMock,
    },
  }));
  return {
    GoogleGenAI: GoogleGenAIMock,
    Type: {
      OBJECT: "OBJECT",
      ARRAY: "ARRAY",
      STRING: "STRING",
      INTEGER: "INTEGER",
      BOOLEAN: "BOOLEAN",
    },
  };
});

describe("CourseGeneratorService", () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  const validCourseMock: GeneratedCourse = {
    courseTitle: "Certified Kubernetes Administrator (CKA)",
    curriculumSource: "Standard Official Frameworks",
    modules: [
      {
        moduleTitle: "Cluster Architecture & Installation",
        description: "Learn Kubernetes cluster setup and core architecture.",
        lessons: [
          {
            title: "Kubeadm Cluster Creation",
            theoryContent: "Detailed theory on initializing control plane nodes with kubeadm.",
            keyTakeaways: [
              "Use kubeadm init to create the control plane",
              "Install CNI plugin for pod networking",
            ],
            quiz: [
              {
                question: "Which command initializes a Kubernetes control-plane node?",
                options: [
                  "kubeadm init",
                  "kubeadm join",
                  "kubectl apply",
                  "systemctl start kubelet",
                ],
                correctIndex: 0,
                explanation: "kubeadm init sets up the Kubernetes control plane.",
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
  });

  it("throws an error if GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateCourse({ topic: "Kubernetes" })).rejects.toThrow(
      "GEMINI_API_KEY is not configured in environment.",
    );
  });

  it("calls Gemini 2.5 Flash with correct execution parameters and response schema", async () => {
    const mockClient = new GoogleGenAI({ apiKey: "test-gemini-api-key" });
    const mockGenerateContent = mockClient.models.generateContent as unknown as ReturnType<typeof vi.fn>;
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validCourseMock),
    });

    const result = await generateCourse({ topic: "Kubernetes" });

    expect(result).toEqual(validCourseMock);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.model).toBe("gemini-2.5-flash");
    expect(callArgs.config.temperature).toBe(0.1);
    expect(callArgs.config.maxOutputTokens).toBe(8192);
    expect(callArgs.config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(callArgs.config.responseMimeType).toBe("application/json");
    expect(callArgs.config.responseSchema).toBe(courseResponseSchema);
  });

  it("injects manual sources into the prompt when provided", async () => {
    const mockClient = new GoogleGenAI({ apiKey: "test-gemini-api-key" });
    const mockGenerateContent = mockClient.models.generateContent as unknown as ReturnType<typeof vi.fn>;
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validCourseMock),
    });

    const sources = [
      "https://kubernetes.io/docs/concepts/architecture/",
      "Official CKA Curriculum Document v1.30",
    ];

    await generateCourse({ topic: "Kubernetes", sources });

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain("Ground the course content and syllabus strictly on the following provided sources:");
    expect(callArgs.contents).toContain(sources[0]);
    expect(callArgs.contents).toContain(sources[1]);
  });

  it("instructs standard official frameworks grounding when sources are omitted or empty", async () => {
    const mockClient = new GoogleGenAI({ apiKey: "test-gemini-api-key" });
    const mockGenerateContent = mockClient.models.generateContent as unknown as ReturnType<typeof vi.fn>;
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validCourseMock),
    });

    await generateCourse({ topic: "IHK Anwendungsentwicklung" });

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain("Ground the syllabus strictly on standard official frameworks (e.g. IHK curriculum or CKA domains).");
  });

  it("retries up to a maximum of 1 retry on transient API errors", async () => {
    const mockClient = new GoogleGenAI({ apiKey: "test-gemini-api-key" });
    const mockGenerateContent = mockClient.models.generateContent as unknown as ReturnType<typeof vi.fn>;

    // First call fails with transient error, second call succeeds
    mockGenerateContent
      .mockRejectedValueOnce(new Error("Transient 503 Service Unavailable"))
      .mockResolvedValueOnce({ text: JSON.stringify(validCourseMock) });

    const result = await generateCourse({ topic: "TypeScript" });

    expect(result).toEqual(validCourseMock);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("throws an error when maxRetries (1 retry, 2 total attempts) is exceeded", async () => {
    const mockClient = new GoogleGenAI({ apiKey: "test-gemini-api-key" });
    const mockGenerateContent = mockClient.models.generateContent as unknown as ReturnType<typeof vi.fn>;

    mockGenerateContent
      .mockRejectedValueOnce(new Error("Persistent 500 Error"))
      .mockRejectedValueOnce(new Error("Persistent 500 Error"));

    await expect(courseGenerator.generateCourse({ topic: "DevOps" })).rejects.toThrow(
      "Course generation failed after 2 attempts",
    );
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});
