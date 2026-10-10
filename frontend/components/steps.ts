import {
  BrainCircuit,
  Newspaper,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type Step = {
  /** Tool identifier used by the backend and saved preferences. */
  id: string;
  /** Short name in the workflow navigation and "Use in" actions. */
  title: string;
  /** One line under the name in the navigation. */
  detail: string;
  /** Page heading and introduction. */
  heading: string;
  intro: string;
  icon: LucideIcon;
  /** Connection the step cannot run without. */
  needs?: "news" | "openai";
};

/** The research workflow in teaching order. Every step also works on its own. */
export const STEPS: Step[] = [
  {
    id: "news",
    title: "Collect news",
    detail: "Search NewsAPI",
    heading: "Collect news",
    intro:
      "Search NewsAPI for articles about a company and a topic, and save them as a table you can use in the next steps.",
    icon: Newspaper,
    needs: "news",
  },
  {
    id: "hf",
    title: "Classify",
    detail: "Hugging Face, on your computer",
    heading: "Classify with a Hugging Face model",
    intro:
      "Give every article a label, such as Environmental, Social, or Governance, using a model that runs on your own computer. No key is needed.",
    icon: BrainCircuit,
  },
  {
    id: "llm",
    title: "Extract",
    detail: "OpenAI, with your own fields",
    heading: "Extract with an LLM",
    intro:
      "Ask an OpenAI model to read every article and fill in the fields you design, such as the event type or who was involved.",
    icon: Sparkles,
    needs: "openai",
  },
];

/** The step whose results feed into each step. */
export const NEXT_STEP: Record<string, string> = { news: "hf", hf: "llm" };

export const stepOf = (id: string) => STEPS.find((s) => s.id === id)!;

export const KEY_NAMES = { news: "NewsAPI", openai: "OpenAI" } as const;
