import {
  ArrowDown,
  Braces,
  FileSpreadsheet,
  ListChecks,
  MessageSquareText,
  Newspaper,
} from "lucide-react";
import { TYPE_LABELS } from "./schema-builder";

/** A worked example of how the Extract step's parts fit together. */
export function ExtractExample() {
  return (
    <div className="explainer">
      <p>
        The model reads one article at a time and fills in a small form. You
        decide what the form asks; it must answer every field, in the type you
        chose.
      </p>
      <div className="explain-grid">
        <div className="explain-box">
          <h4>
            <MessageSquareText size={15} /> 1. Instructions
          </h4>
          <p>
            What to do, in plain words:
            <q>
              Read the article. Record its overall tone and how many jobs are
              cut.
            </q>
          </p>
        </div>
        <div className="explain-box">
          <h4>
            <ListChecks size={15} /> 2. Fields
          </h4>
          <ul className="example-fields">
            <li>
              <code>tone</code> <span>One choice from a list</span>
            </li>
            <li>
              <code>jobs_cut</code> <span>Whole number, can be empty</span>
            </li>
            <li>
              <code>layoffs</code> <span>Yes / no</span>
            </li>
          </ul>
        </div>
        <div className="explain-box">
          <h4>
            <ListChecks size={15} /> 3. Allowed values
          </h4>
          <p>The choices for tone:</p>
          <div className="chips">
            <span>positive</span>
            <span>negative</span>
            <span>neutral</span>
          </div>
        </div>
      </div>
      <div className="explain-flow">
        <ArrowDown size={16} /> with each article&apos;s text{" "}
        <Newspaper size={15} />
      </div>
      <div className="explain-grid two">
        <div className="explain-box answer">
          <h4>
            <Braces size={15} /> The model&apos;s answer
          </h4>
          <pre>{`{
  "tone": "negative",
  "jobs_cut": 1900,
  "layoffs": true
}`}</pre>
        </div>
        <div className="explain-box answer">
          <h4>
            <FileSpreadsheet size={15} /> New columns in your file
          </h4>
          <table className="mini-table">
            <thead>
              <tr>
                <th>title</th>
                <th>llm_field_tone</th>
                <th>llm_field_jobs_cut</th>
                <th>llm_field_layoffs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Microsoft cuts…</td>
                <td>negative</td>
                <td>1900</td>
                <td>true</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const EXAMPLES: Record<string, string> = {
  string: '"Microsoft", "a one-sentence summary"',
  number: "0.75, 12.5",
  integer: "1900, 3",
  boolean: "true or false",
  enum: '"positive" (only a listed choice)',
  array: '["Microsoft", "Activision"]',
  object: '{"name": "Satya Nadella", "role": "CEO"}',
};

/** What each field type means, with an example answer. */
export function FieldTypeGuide() {
  return (
    <table className="guide-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Use it for</th>
          <th>Example answer</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <tr key={type}>
            <td>
              <strong>{label}</strong>
              <code>{type}</code>
            </td>
            <td>
              {
                {
                  string: "Names, quotes, short summaries",
                  number: "Amounts, percentages, scores",
                  integer: "Counts: jobs, people, days",
                  boolean: "Questions with a yes/no answer",
                  enum: "Categories you define in advance",
                  array: "Several of the same thing",
                  object: "Fields that belong together",
                }[type]
              }
            </td>
            <td>
              <code>{EXAMPLES[type]}</code>
            </td>
          </tr>
        ))}
        <tr>
          <td>
            <strong>Can be empty</strong>
            <code>null</code>
          </td>
          <td>Tick it when an article might not say</td>
          <td>
            <code>null</code> instead of a made-up value
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** What allowed-value lists (enums) are for. */
export function EnumGuide() {
  return (
    <div className="explainer compact">
      <p>
        An <strong>allowed-value list</strong> (an <em>enum</em>) is like the
        options of a multiple-choice question. For example, a list called{" "}
        <code>tone</code>:
      </p>
      <div className="chips">
        <span>positive</span>
        <span>negative</span>
        <span>neutral</span>
      </div>
      <p>
        Every list is shown to the model in each prompt, so it knows the
        options. To <strong>force</strong> a field to use them, set that field
        to <em>One choice from a list</em> and pick the list under “Or copy an
        allowed-value list”. The model can then only answer with one of these
        exact words, which keeps your results consistent and easy to count.
      </p>
    </div>
  );
}
