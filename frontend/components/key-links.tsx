import { ExternalLink } from "lucide-react";

/** Where students create the keys the workbench asks for. */
export function KeyLinks() {
  return (
    <ul className="key-links">
      <li>
        <a href="https://newsapi.org/register" target="_blank" rel="noreferrer">
          Get a free NewsAPI key <ExternalLink size={12} />
        </a>
      </li>
      <li>
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noreferrer"
        >
          Create an OpenAI API key <ExternalLink size={12} />
        </a>
      </li>
    </ul>
  );
}
