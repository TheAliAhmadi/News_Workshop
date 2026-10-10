import {
  BrainCircuit,
  Brush,
  ChartNoAxesCombined,
  ClipboardCheck,
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
    title: "Collect",
    detail: "Find news articles",
    heading: "Collect news",
    intro:
      "Search NewsAPI for articles about a company and topic, and save them as a dataset.",
    icon: Newspaper,
    needs: "news",
  },
  {
    id: "clean",
    title: "Clean",
    detail: "Tidy and de-duplicate",
    heading: "Clean data",
    intro:
      "Normalize text in selected columns and remove duplicate rows. The result is saved as a new file.",
    icon: Brush,
  },
  {
    id: "hf",
    title: "Classify",
    detail: "FinBERT, on this computer",
    heading: "Classify text",
    intro:
      "Label each row with a text classifier such as FinBERT-ESG. It runs on this computer and needs no key.",
    icon: BrainCircuit,
  },
  {
    id: "llm",
    title: "Extract",
    detail: "Structured fields with AI",
    heading: "Extract with AI",
    intro:
      "Turn article text into your own research variables with an OpenAI model and a schema you design.",
    icon: Sparkles,
    needs: "openai",
  },
  {
    id: "review",
    title: "Validate",
    detail: "Check results by hand",
    heading: "Validate by hand",
    intro:
      "Label a random sample yourself and measure how often you agree with the coded values.",
    icon: ClipboardCheck,
  },
  {
    id: "aggregate",
    title: "Aggregate",
    detail: "Firm-month measures",
    heading: "Aggregate & export",
    intro:
      "Turn coded articles into firm–month mention counts and shares, ready for analysis.",
    icon: ChartNoAxesCombined,
  },
];

export const stepOf = (id: string) => STEPS.find((s) => s.id === id)!;

export const KEY_NAMES = { news: "NewsAPI", openai: "OpenAI" } as const;
