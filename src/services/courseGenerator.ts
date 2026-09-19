import { GoogleGenAI, Type } from "@google/genai";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Lesson {
  title: string;
  theoryContent: string;
  keyTakeaways: string[];
  quiz: QuizQuestion[];
}

export interface CourseModule {
  moduleTitle: string;
  description: string;
  lessons: Lesson[];
}

export interface GeneratedCourse {
  courseTitle: string;
  curriculumSource: string;
  modules: CourseModule[];
}

export interface GenerateCourseOptions {
  topic: string;
  sources?: string[];
}

export const courseResponseSchema = {
  type: Type.OBJECT,
  properties: {
    courseTitle: { type: Type.STRING },
    curriculumSource: { type: Type.STRING },
    modules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          moduleTitle: { type: Type.STRING },
          description: { type: Type.STRING },
          lessons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                theoryContent: { type: Type.STRING },
                keyTakeaways: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                quiz: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                    },
                    required: ["question", "options", "correctIndex", "explanation"],
                  },
                },
              },
              required: ["title", "theoryContent", "keyTakeaways", "quiz"],
            },
          },
        },
        required: ["moduleTitle", "description", "lessons"],
      },
    },
  },
  required: ["courseTitle", "curriculumSource", "modules"],
};

export class CourseGeneratorService {
  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in environment.");
    }
    return new GoogleGenAI({ apiKey });
  }

  async generateCourse(options: GenerateCourseOptions): Promise<GeneratedCourse> {
    const ai = this.getClient();

    const sourcesPrompt =
      options.sources && options.sources.length > 0
        ? `Ground the course content and syllabus strictly on the following provided sources:\n${options.sources.join("\n\n")}`
        : `Ground the syllabus strictly on standard official frameworks (e.g. IHK curriculum or CKA domains).`;

    const prompt = `Create a comprehensive, structured course on the topic: "${options.topic}".\n${sourcesPrompt}`;

    const maxRetries = 1;
    let response;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: "application/json",
            responseSchema: courseResponseSchema,
          },
        });
        break;
      } catch (err) {
        lastError = err;
        if (attempt >= maxRetries) {
          throw new Error(
            `Course generation failed after ${maxRetries + 1} attempts: ${
              err instanceof Error ? err.message : String(err)
            }`,
            { cause: err },
          );
        }
      }
    }

    if (!response || !response.text) {
      throw new Error("No response text returned from Gemini API.");
    }

    const courseData = JSON.parse(response.text) as GeneratedCourse;
    return courseData;
  }
}

export const courseGenerator = new CourseGeneratorService();

export async function generateCourse(options: GenerateCourseOptions): Promise<GeneratedCourse> {
  return courseGenerator.generateCourse(options);
}
