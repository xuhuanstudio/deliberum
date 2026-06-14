import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type WebLanguage = "en" | "zh-CN";

type TranslationValues = Record<string, string | number>;
type TranslationMap = Record<string, string>;

const SUPPORTED_LANGUAGES: readonly WebLanguage[] = ["en", "zh-CN"];

const LANGUAGE_OPTIONS: readonly {
  code: WebLanguage;
  label: string;
}[] = [
  {
    code: "en",
    label: "English"
  },
  {
    code: "zh-CN",
    label: "\u7b80\u4f53\u4e2d\u6587"
  }
];

const ZH_CN_TRANSLATIONS: TranslationMap = {
  "User Mode": "\u7528\u6237\u6a21\u5f0f",
  Language: "\u8bed\u8a00",
  Discussions: "\u8ba8\u8bba",
  "Start discussion": "\u5f00\u59cb\u8ba8\u8bba",
  Discussion: "\u8ba8\u8bba",
  "Current conclusion": "\u5f53\u524d\u7ed3\u8bba",
  "Current conclusion not ready": "\u5f53\u524d\u7ed3\u8bba\u5c1a\u672a\u5c31\u7eea",
  "Start a discussion": "\u5f00\u59cb\u8ba8\u8bba",
  "Continue discussions": "\u7ee7\u7eed\u8ba8\u8bba",
  "Continue existing discussions": "\u7ee7\u7eed\u5df2\u6709\u8ba8\u8bba",
  "Start or continue a deliberation in plain language, then inspect the current conclusion, perspectives, disagreements, evidence gaps, and next actions.":
    "\u7528\u81ea\u7136\u8bed\u8a00\u5f00\u59cb\u6216\u7ee7\u7eed\u5ba1\u8bae\uff0c\u7136\u540e\u67e5\u770b\u5f53\u524d\u7ed3\u8bba\u3001\u4e3b\u8981\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u3002",
  "Start or continue a discussion, then review the current conclusion, main perspectives, open disagreements, risks, missing evidence, and next recommended actions.":
    "\u5f00\u59cb\u6216\u7ee7\u7eed\u4e00\u4e2a\u8ba8\u8bba\uff0c\u7136\u540e\u67e5\u770b\u5f53\u524d\u7ed3\u8bba\u3001\u4e3b\u8981\u89c2\u70b9\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
  "Use Deliberum to frame a hard question, collect independent perspectives, compare the strongest options, keep disagreements visible, and turn the current state into a reviewable conclusion with next steps.":
    "\u4f7f\u7528 Deliberum \u68b3\u7406\u56f0\u96be\u95ee\u9898\uff0c\u6536\u96c6\u72ec\u7acb\u89c6\u89d2\uff0c\u6bd4\u8f83\u6700\u5f3a\u9009\u9879\uff0c\u4fdd\u7559\u53ef\u89c1\u5206\u6b67\uff0c\u5e76\u628a\u5f53\u524d\u72b6\u6001\u6574\u7406\u6210\u53ef\u5ba1\u9605\u7684\u7ed3\u8bba\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u3002",
  "What you can do": "\u4f60\u53ef\u4ee5\u505a\u4ec0\u4e48",
  "The default path is for people who need a clear decision surface, not system records.":
    "\u9ed8\u8ba4\u8def\u5f84\u9762\u5411\u9700\u8981\u6e05\u6670\u51b3\u7b56\u754c\u9762\u7684\u4eba\uff0c\u800c\u4e0d\u662f\u7cfb\u7edf\u8bb0\u5f55\u67e5\u770b\u8005\u3002",
  "1. Start a discussion": "1. \u5f00\u59cb\u8ba8\u8bba",
  "Write the question, goals, constraints, and expected output as a discussion brief.":
    "\u628a\u95ee\u9898\u3001\u76ee\u6807\u3001\u7ea6\u675f\u548c\u671f\u671b\u8f93\u51fa\u5199\u6210\u8ba8\u8bba\u7b80\u62a5\u3002",
  "2. Review the strongest current options": "2. \u67e5\u770b\u5f53\u524d\u6700\u5f3a\u9009\u9879",
  "Independent first responses become visible as main perspectives without collapsing them into a hidden authority.":
    "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u4f1a\u8f6c\u5316\u4e3a\u4e3b\u8981\u89c2\u70b9\uff0c\u800c\u4e0d\u4f1a\u88ab\u6298\u53e0\u6210\u4e00\u4e2a\u9690\u85cf\u6743\u5a01\u7b54\u6848\u3002",
  "3. Decide what to do next": "3. \u51b3\u5b9a\u4e0b\u4e00\u6b65",
  "The current conclusion keeps open disagreements, risks, missing evidence, and recommended next actions together.":
    "\u5f53\u524d\u7ed3\u8bba\u4f1a\u628a\u672a\u89e3\u51b3\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u5efa\u8bae\u4e0b\u4e00\u6b65\u653e\u5728\u4e00\u8d77\u3002",
  "What the discussion keeps visible": "\u8ba8\u8bba\u4f1a\u6301\u7eed\u5c55\u793a\u4ec0\u4e48",
  "Deliberum keeps the decision surface organized around what a person needs to inspect before relying on a conclusion.":
    "Deliberum \u4f1a\u56f4\u7ed5\u4eba\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\u9700\u8981\u68c0\u67e5\u7684\u5185\u5bb9\u7ec4\u7ec7\u51b3\u7b56\u754c\u9762\u3002",
  "Discussion brief": "\u8ba8\u8bba\u7b80\u62a5",
  "Question, goals, constraints, and expected output.": "\u95ee\u9898\u3001\u76ee\u6807\u3001\u7ea6\u675f\u548c\u671f\u671b\u8f93\u51fa\u3002",
  "Independent first responses": "\u72ec\u7acb\u521d\u59cb\u56de\u5e94",
  "Separate starting perspectives before the group converges.": "\u5728\u89c2\u70b9\u6536\u655b\u524d\u4fdd\u7559\u5206\u79bb\u7684\u521d\u59cb\u89c6\u89d2\u3002",
  "Strongest current options": "\u5f53\u524d\u6700\u5f3a\u9009\u9879",
  "The best visible choices without selecting one option invisibly.": "\u5c55\u793a\u5f53\u524d\u6700\u6709\u529b\u7684\u9009\u62e9\uff0c\u800c\u4e0d\u662f\u6697\u4e2d\u9009\u5b9a\u4e00\u4e2a\u7b54\u6848\u3002",
  "Open disagreements": "\u672a\u89e3\u51b3\u5206\u6b67",
  "Concerns that still constrain the conclusion.": "\u4ecd\u7136\u7ea6\u675f\u7ed3\u8bba\u7684\u62c5\u5fe7\u3002",
  "Requirements this answer must satisfy": "\u7b54\u6848\u5fc5\u987b\u6ee1\u8db3\u7684\u8981\u6c42",
  "Conditions the final answer must meet.": "\u6700\u7ec8\u7b54\u6848\u5fc5\u987b\u6ee1\u8db3\u7684\u6761\u4ef6\u3002",
  "Evidence and verification": "\u8bc1\u636e\u4e0e\u6838\u67e5",
  "Claims or gaps that still need checking.": "\u4ecd\u9700\u6838\u67e5\u7684\u4e3b\u5f20\u6216\u7f3a\u53e3\u3002",
  "Risk review": "\u98ce\u9669\u5ba1\u67e5",
  "Limits, assumptions, and failure cases to keep visible.": "\u9700\u8981\u6301\u7eed\u53ef\u89c1\u7684\u9650\u5236\u3001\u5047\u8bbe\u548c\u5931\u8d25\u60c5\u5f62\u3002",
  "The reviewable result with next steps.": "\u53ef\u5ba1\u9605\u7684\u7ed3\u679c\u548c\u4e0b\u4e00\u6b65\u3002",
  "Create a discussion that keeps the brief, independent first responses, strongest options, disagreements, requirements, evidence and verification, risk review, and current conclusion visible.":
    "\u521b\u5efa\u4e00\u4e2a\u8ba8\u8bba\uff0c\u5e76\u6301\u7eed\u5c55\u793a\u7b80\u62a5\u3001\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3001\u6700\u5f3a\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u4e0e\u6838\u67e5\u3001\u98ce\u9669\u5ba1\u67e5\u548c\u5f53\u524d\u7ed3\u8bba\u3002",
  "Start from a question": "\u4ece\u4e00\u4e2a\u95ee\u9898\u5f00\u59cb",
  "Write a brief in plain language or use the sample brief to try the full discussion flow immediately.":
    "\u7528\u81ea\u7136\u8bed\u8a00\u5199\u4e00\u4efd\u7b80\u62a5\uff0c\u6216\u4f7f\u7528\u793a\u4f8b\u7b80\u62a5\u7acb\u5373\u4f53\u9a8c\u5b8c\u6574\u8ba8\u8bba\u6d41\u7a0b\u3002",
  "Describe what you need to decide or clarify. Deliberum will structure the discussion so the conclusion, disagreements, risks, evidence gaps, and next actions stay visible.":
    "\u63cf\u8ff0\u4f60\u9700\u8981\u51b3\u5b9a\u6216\u6f84\u6e05\u7684\u5185\u5bb9\u3002Deliberum \u4f1a\u7ec4\u7ec7\u8ba8\u8bba\uff0c\u8ba9\u7ed3\u8bba\u3001\u5206\u6b67\u3001\u98ce\u9669\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u4e0b\u4e00\u6b65\u4fdd\u6301\u53ef\u89c1\u3002",
  "Discussion question": "\u8ba8\u8bba\u95ee\u9898",
  Required: "\u5fc5\u586b",
  "What should we decide, compare, or clarify?": "\u6211\u4eec\u9700\u8981\u51b3\u5b9a\u3001\u6bd4\u8f83\u6216\u6f84\u6e05\u4ec0\u4e48\uff1f",
  "Creating discussion": "\u6b63\u5728\u521b\u5efa\u8ba8\u8bba",
  "Create discussion": "\u521b\u5efa\u8ba8\u8bba",
  "Use sample brief": "\u4f7f\u7528\u793a\u4f8b\u7b80\u62a5",
  "Add goals, constraints, and expected result": "\u6dfb\u52a0\u76ee\u6807\u3001\u7ea6\u675f\u548c\u671f\u671b\u7ed3\u679c",
  Goals: "\u76ee\u6807",
  "One goal per line": "\u6bcf\u884c\u4e00\u4e2a\u76ee\u6807",
  Constraints: "\u7ea6\u675f",
  "One constraint per line": "\u6bcf\u884c\u4e00\u4e2a\u7ea6\u675f",
  "Expected result": "\u671f\u671b\u7ed3\u679c",
  "What should the current conclusion include?": "\u5f53\u524d\u7ed3\u8bba\u5e94\u8be5\u5305\u542b\u4ec0\u4e48\uff1f",
  "Works without setup": "\u65e0\u9700\u914d\u7f6e\u5373\u53ef\u4f7f\u7528",
  "The sample brief uses built-in discussion material so a first-time user can review the flow immediately.":
    "\u793a\u4f8b\u7b80\u62a5\u4f7f\u7528\u5185\u7f6e\u8ba8\u8bba\u6750\u6599\uff0c\u8ba9\u9996\u6b21\u7528\u6237\u53ef\u4ee5\u7acb\u5373\u67e5\u770b\u6d41\u7a0b\u3002",
  "Complete discussion loop": "\u5b8c\u6574\u8ba8\u8bba\u95ed\u73af",
  "It creates a discussion brief, independent first responses, strongest options, disagreements, requirements, evidence needs, risk review, and current conclusion.":
    "\u5b83\u4f1a\u521b\u5efa\u8ba8\u8bba\u7b80\u62a5\u3001\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3001\u6700\u5f3a\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u9700\u6c42\u3001\u98ce\u9669\u5ba1\u67e5\u548c\u5f53\u524d\u7ed3\u8bba\u3002",
  "Discussion question is required.": "\u8bf7\u586b\u5199\u8ba8\u8bba\u95ee\u9898\u3002",
  "Discussion could not be created": "\u8ba8\u8bba\u521b\u5efa\u5931\u8d25",
  "Discussion created": "\u8ba8\u8bba\u5df2\u521b\u5efa",
  "Next, open the discussion room and continue the guided discussion to collect perspectives, surface disagreements, and produce a reviewable conclusion.":
    "\u4e0b\u4e00\u6b65\uff0c\u6253\u5f00\u8ba8\u8bba\u5ba4\u5e76\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u4ee5\u6536\u96c6\u89c6\u89d2\u3001\u5448\u73b0\u5206\u6b67\u5e76\u751f\u6210\u53ef\u5ba1\u9605\u7684\u7ed3\u8bba\u3002",
  "Open discussion room": "\u6253\u5f00\u8ba8\u8bba\u5ba4",
  "Existing discussions": "\u5df2\u6709\u8ba8\u8bba",
  "No discussions yet": "\u8fd8\u6ca1\u6709\u8ba8\u8bba",
  "Start with a question. Deliberum will create a discussion brief, collect independent first responses, and keep the conclusion, disagreements, risks, and next steps visible.":
    "\u4ece\u4e00\u4e2a\u95ee\u9898\u5f00\u59cb\u3002Deliberum \u4f1a\u521b\u5efa\u8ba8\u8bba\u7b80\u62a5\uff0c\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\uff0c\u5e76\u6301\u7eed\u5c55\u793a\u7ed3\u8bba\u3001\u5206\u6b67\u3001\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u3002",
  "How discussions work": "\u8ba8\u8bba\u5982\u4f55\u8fd0\u4f5c",
  "The default mode explains the deliberation loop in user language.":
    "\u9ed8\u8ba4\u6a21\u5f0f\u4f1a\u7528\u7528\u6237\u8bed\u8a00\u89e3\u91ca\u5ba1\u8bae\u5faa\u73af\u3002",
  "The topic, goals, constraints, participants, and output expectations before anyone contributes.":
    "\u4efb\u4f55\u4eba\u8d21\u732e\u4e4b\u524d\u7684\u4e3b\u9898\u3001\u76ee\u6807\u3001\u7ea6\u675f\u3001\u53c2\u4e0e\u8005\u548c\u8f93\u51fa\u671f\u671b\u3002",
  "Early work is kept separate so one visible answer does not anchor the discussion.":
    "\u65e9\u671f\u5de5\u4f5c\u4f1a\u4fdd\u6301\u5206\u79bb\uff0c\u907f\u514d\u4e00\u4e2a\u53ef\u89c1\u7b54\u6848\u951a\u5b9a\u6574\u4e2a\u8ba8\u8bba\u3002",
  "Main perspectives stay visible as options, without a hidden authority choosing for the user.":
    "\u4e3b\u8981\u89c2\u70b9\u4f1a\u4f5c\u4e3a\u9009\u9879\u4fdd\u6301\u53ef\u89c1\uff0c\u800c\u4e0d\u662f\u7531\u9690\u85cf\u6743\u5a01\u66ff\u7528\u6237\u9009\u62e9\u3002",
  "A reviewable outcome with open disagreements, risks, missing evidence, and next steps.":
    "\u5305\u542b\u672a\u89e3\u51b3\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u7684\u53ef\u5ba1\u9605\u7ed3\u679c\u3002",
  "Discussion room": "\u8ba8\u8bba\u5ba4",
  "A human-readable room view of the brief, participant perspectives, discussion flow, unresolved disagreements, missing evidence, current conclusion, and next actions.":
    "\u9762\u5411\u4eba\u7684\u8ba8\u8bba\u5ba4\u89c6\u56fe\uff0c\u5c55\u793a\u7b80\u62a5\u3001\u53c2\u4e0e\u8005\u89c6\u89d2\u3001\u8ba8\u8bba\u6d41\u7a0b\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u7f3a\u5931\u8bc1\u636e\u3001\u5f53\u524d\u7ed3\u8bba\u548c\u4e0b\u4e00\u6b65\u3002",
  "Next: review current conclusion": "\u4e0b\u4e00\u6b65\uff1a\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba",
  "Next: continue guided discussion": "\u4e0b\u4e00\u6b65\uff1a\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba",
  "Start with the conclusion, then inspect disagreements, requirements, and missing evidence before relying on it.":
    "\u5148\u67e5\u770b\u7ed3\u8bba\uff0c\u518d\u68c0\u67e5\u5206\u6b67\u3001\u8981\u6c42\u548c\u7f3a\u5931\u8bc1\u636e\uff0c\u7136\u540e\u518d\u51b3\u5b9a\u662f\u5426\u4f9d\u8d56\u5b83\u3002",
  "Continue the guided discussion so the main perspectives, disagreements, requirements, evidence, and conclusion can be produced.":
    "\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u4ee5\u751f\u6210\u4e3b\u8981\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u548c\u7ed3\u8bba\u3002",
  "What is being discussed": "\u6b63\u5728\u8ba8\u8bba\u4ec0\u4e48",
  "The room keeps the brief, participant perspectives, disagreements, missing evidence, risks, current conclusion, and next actions visible together.":
    "\u8ba8\u8bba\u5ba4\u4f1a\u628a\u7b80\u62a5\u3001\u53c2\u4e0e\u8005\u89c6\u89d2\u3001\u5206\u6b67\u3001\u7f3a\u5931\u8bc1\u636e\u3001\u98ce\u9669\u3001\u5f53\u524d\u7ed3\u8bba\u548c\u4e0b\u4e00\u6b65\u4e00\u8d77\u5c55\u793a\u3002",
  "No goals listed yet.": "\u5c1a\u672a\u5217\u51fa\u76ee\u6807\u3002",
  "No constraints listed yet.": "\u5c1a\u672a\u5217\u51fa\u7ea6\u675f\u3002",
  "No expected result listed yet.": "\u5c1a\u672a\u5217\u51fa\u671f\u671b\u7ed3\u679c\u3002",
  "Discussion timeline": "\u8ba8\u8bba\u65f6\u95f4\u7ebf",
  "What has happened in the room": "\u8ba8\u8bba\u5ba4\u4e2d\u53d1\u751f\u4e86\u4ec0\u4e48",
  "Follow the room like a structured conversation: brief, independent first responses, main perspectives, disagreements, evidence checks, and conclusion review.":
    "\u50cf\u9605\u8bfb\u7ed3\u6784\u5316\u5bf9\u8bdd\u4e00\u6837\u8ddf\u8fdb\u8ba8\u8bba\u5ba4\uff1a\u7b80\u62a5\u3001\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3001\u4e3b\u8981\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8bc1\u636e\u6838\u67e5\u548c\u7ed3\u8bba\u5ba1\u9605\u3002",
  Ready: "\u5df2\u5c31\u7eea",
  "Not started yet": "\u5c1a\u672a\u5f00\u59cb",
  "Needs review": "\u9700\u8981\u5ba1\u9605",
  "No open items visible": "\u6682\u65e0\u53ef\u89c1\u672a\u89e3\u51b3\u4e8b\u9879",
  Completed: "\u5df2\u5b8c\u6210",
  Updated: "\u5df2\u66f4\u65b0",
  "Already in progress": "\u5df2\u5728\u8fdb\u884c\u4e2d",
  "Discussion step": "\u8ba8\u8bba\u6b65\u9aa4",
  "What different participants contributed": "\u4e0d\u540c\u53c2\u4e0e\u8005\u8d21\u732e\u4e86\u4ec0\u4e48",
  "Participant perspectives": "\u53c2\u4e0e\u8005\u89c6\u89d2",
  "Strong perspectives are shown as readable discussion contributions, while technical details stay in Advanced mode.":
    "\u5f3a\u89c2\u70b9\u4f1a\u4ee5\u53ef\u8bfb\u7684\u8ba8\u8bba\u8d21\u732e\u5c55\u793a\uff0c\u6280\u672f\u7ec6\u8282\u4fdd\u7559\u5728\u9ad8\u7ea7\u6a21\u5f0f\u4e2d\u3002",
  "No participant perspectives visible yet": "\u5c1a\u65e0\u53ef\u89c1\u53c2\u4e0e\u8005\u89c6\u89d2",
  "Continue the guided discussion so independent first responses can become readable perspectives in the room.":
    "\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u8ba9\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u8f6c\u5316\u4e3a\u8ba8\u8bba\u5ba4\u4e2d\u7684\u53ef\u8bfb\u89c6\u89d2\u3002",
  "Current room summary": "\u5f53\u524d\u8ba8\u8bba\u6458\u8981",
  "Ready to review": "\u53ef\u5ba1\u9605",
  "Not ready yet": "\u5c1a\u672a\u5c31\u7eea",
  "Review the conclusion together with disagreements, evidence gaps, risks, and next actions.":
    "\u5c06\u7ed3\u8bba\u4e0e\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u3001\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u4e00\u8d77\u5ba1\u9605\u3002",
  "Continue the discussion before treating any answer as a conclusion.":
    "\u5728\u628a\u4efb\u4f55\u7b54\u6848\u5f53\u4f5c\u7ed3\u8bba\u524d\uff0c\u5148\u7ee7\u7eed\u8ba8\u8bba\u3002",
  "Missing evidence": "\u7f3a\u5931\u8bc1\u636e",
  "Requirements to satisfy": "\u9700\u8981\u6ee1\u8db3\u7684\u8981\u6c42",
  Risks: "\u98ce\u9669",
  "Review needed": "\u9700\u8981\u5ba1\u9605",
  "No open blockers visible": "\u6682\u65e0\u53ef\u89c1\u963b\u585e\u9879",
  "Review current conclusion": "\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba",
  "Continue discussion": "\u7ee7\u7eed\u8ba8\u8bba",
  "A reviewable conclusion is available with risks, evidence gaps, and next actions.":
    "\u5df2\u6709\u53ef\u5ba1\u9605\u7ed3\u8bba\uff0c\u5e76\u5305\u542b\u98ce\u9669\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u4e0b\u4e00\u6b65\u3002",
  "The discussion needs more guided work before a conclusion is useful.":
    "\u9700\u8981\u66f4\u591a\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u7ed3\u8bba\u624d\u6709\u5b9e\u7528\u4ef7\u503c\u3002",
  "Strong options stay visible without collapsing into one hidden authority.":
    "\u5f3a\u9009\u9879\u4fdd\u6301\u53ef\u89c1\uff0c\u4e0d\u4f1a\u6298\u53e0\u6210\u4e00\u4e2a\u9690\u85cf\u6743\u5a01\u3002",
  "Unresolved objections that still constrain the current conclusion.":
    "\u4ecd\u7136\u7ea6\u675f\u5f53\u524d\u7ed3\u8bba\u7684\u672a\u89e3\u51b3\u53cd\u5bf9\u610f\u89c1\u3002",
  "Explicit obligations that keep the output correct, complete, and bounded.":
    "\u7528\u4e8e\u4fdd\u6301\u8f93\u51fa\u6b63\u786e\u3001\u5b8c\u6574\u4e14\u6709\u8fb9\u754c\u7684\u660e\u786e\u8981\u6c42\u3002",
  "Evidence gaps": "\u8bc1\u636e\u7f3a\u53e3",
  "Missing or unchecked evidence that should be resolved before relying on the answer.":
    "\u5728\u4f9d\u8d56\u7b54\u6848\u524d\u5e94\u89e3\u51b3\u7684\u7f3a\u5931\u6216\u672a\u6838\u67e5\u8bc1\u636e\u3002",
  "Next recommended actions": "\u4e0b\u4e00\u6b65\u5efa\u8bae",
  "Review open disagreements": "\u5ba1\u9605\u672a\u89e3\u51b3\u5206\u6b67",
  "Resolve evidence gaps": "\u89e3\u51b3\u8bc1\u636e\u7f3a\u53e3",
  "Confirm answer requirements": "\u786e\u8ba4\u7b54\u6848\u8981\u6c42",
  "Collect main perspectives": "\u6536\u96c6\u4e3b\u8981\u89c2\u70b9",
  "Open conclusion": "\u6253\u5f00\u7ed3\u8bba",
  "View disagreements": "\u67e5\u770b\u5206\u6b67",
  "Review evidence": "\u5ba1\u9605\u8bc1\u636e",
  "View requirements": "\u67e5\u770b\u8981\u6c42",
  "No main perspectives are visible yet. Continue the discussion before relying on a conclusion.":
    "\u5c1a\u65e0\u53ef\u89c1\u4e3b\u8981\u89c2\u70b9\u3002\u8bf7\u5148\u7ee7\u7eed\u8ba8\u8bba\uff0c\u518d\u4f9d\u8d56\u7ed3\u8bba\u3002",
  "Review the current conclusion together with main perspectives, open disagreements, missing evidence, risks, and next actions.":
    "\u5c06\u5f53\u524d\u7ed3\u8bba\u4e0e\u4e3b\u8981\u89c2\u70b9\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u7f3a\u5931\u8bc1\u636e\u3001\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u4e00\u8d77\u5ba1\u9605\u3002",
  "Back to discussion": "\u8fd4\u56de\u8ba8\u8bba",
  "A readable summary of the current result. Advanced details keep the underlying technical response for developers.":
    "\u5f53\u524d\u7ed3\u679c\u7684\u53ef\u8bfb\u6458\u8981\u3002\u5e95\u5c42\u6280\u672f\u54cd\u5e94\u4fdd\u7559\u5728\u9ad8\u7ea7\u8be6\u60c5\u4e2d\u4f9b\u5f00\u53d1\u8005\u67e5\u770b\u3002",
  "Current conclusion not available": "\u5f53\u524d\u7ed3\u8bba\u4e0d\u53ef\u7528",
  "The discussion has not produced conclusion-ready material yet. Continue the guided discussion before opening the current conclusion.":
    "\u8ba8\u8bba\u5c1a\u672a\u751f\u6210\u53ef\u8fdb\u5165\u7ed3\u8bba\u9636\u6bb5\u7684\u6750\u6599\u3002\u8bf7\u5148\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u518d\u6253\u5f00\u5f53\u524d\u7ed3\u8bba\u3002",
  "More than one conclusion-ready draft is available, so Deliberum cannot choose one automatically.":
    "\u5b58\u5728\u591a\u4e2a\u53ef\u8fdb\u5165\u7ed3\u8bba\u9636\u6bb5\u7684\u8349\u7a3f\uff0c\u56e0\u6b64 Deliberum \u65e0\u6cd5\u81ea\u52a8\u9009\u62e9\u5176\u4e2d\u4e00\u4e2a\u3002",
  "Deliberum could not safely prepare the current conclusion from the available discussion material.":
    "Deliberum \u65e0\u6cd5\u4ece\u73b0\u6709\u8ba8\u8bba\u6750\u6599\u4e2d\u5b89\u5168\u5730\u51c6\u5907\u5f53\u524d\u7ed3\u8bba\u3002",
  "Deliberum returned an unavailable conclusion state. Open Advanced details for the technical reason.":
    "Deliberum \u8fd4\u56de\u4e86\u4e0d\u53ef\u7528\u7684\u7ed3\u8bba\u72b6\u6001\u3002\u8bf7\u6253\u5f00\u9ad8\u7ea7\u8be6\u60c5\u67e5\u770b\u6280\u672f\u539f\u56e0\u3002",
  "Current conclusion ready to review": "\u5f53\u524d\u7ed3\u8bba\u53ef\u4f9b\u5ba1\u9605",
  "This is reviewable discussion material. Check disagreements, risks, missing evidence, and next actions before relying on it.":
    "\u8fd9\u662f\u53ef\u5ba1\u9605\u7684\u8ba8\u8bba\u6750\u6599\u3002\u5728\u4f9d\u8d56\u5b83\u4e4b\u524d\uff0c\u8bf7\u68c0\u67e5\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u3002",
  "Current conclusion remains provisional": "\u5f53\u524d\u7ed3\u8bba\u4ecd\u662f\u4e34\u65f6\u7ed3\u8bba",
  "Treat this as a working conclusion until the visible disagreements, risks, and evidence gaps have been reviewed.":
    "\u5728\u53ef\u89c1\u5206\u6b67\u3001\u98ce\u9669\u548c\u8bc1\u636e\u7f3a\u53e3\u5b8c\u6210\u5ba1\u9605\u524d\uff0c\u8bf7\u5c06\u5176\u89c6\u4e3a\u5de5\u4f5c\u4e2d\u7684\u7ed3\u8bba\u3002",
  "Current conclusion status unknown": "\u5f53\u524d\u7ed3\u8bba\u72b6\u6001\u672a\u77e5",
  "Review the conclusion together with its disagreements, risks, missing evidence, and next actions.":
    "\u5c06\u7ed3\u8bba\u4e0e\u5176\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u4e00\u8d77\u5ba1\u9605\u3002",
  "No current conclusion is available yet.": "\u5f53\u524d\u8fd8\u6ca1\u6709\u53ef\u7528\u7ed3\u8bba\u3002",
  "Current conclusion snapshot": "\u5f53\u524d\u7ed3\u8bba\u5feb\u7167",
  "Current recommendation": "\u5f53\u524d\u5efa\u8bae",
  "Risks and boundaries": "\u98ce\u9669\u4e0e\u8fb9\u754c",
  "Conclusion review path": "\u7ed3\u8bba\u5ba1\u9605\u8def\u5f84",
  "Review path": "\u5ba1\u9605\u8def\u5f84",
  "Before relying on this conclusion": "\u5728\u4f9d\u8d56\u6b64\u7ed3\u8bba\u4e4b\u524d",
  "Start with the recommendation, then check the visible disagreements, evidence gaps, risks, and next recommended actions.":
    "\u5148\u9605\u8bfb\u5efa\u8bae\uff0c\u518d\u68c0\u67e5\u53ef\u89c1\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u3001\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
  "Read the recommendation": "\u9605\u8bfb\u5efa\u8bae",
  "Use the current recommendation as reviewable material, not as an unquestioned final answer.":
    "\u5c06\u5f53\u524d\u5efa\u8bae\u4f5c\u4e3a\u53ef\u5ba1\u9605\u6750\u6599\uff0c\u800c\u4e0d\u662f\u65e0\u9700\u8d28\u7591\u7684\u6700\u7ec8\u7b54\u6848\u3002",
  "Check missing evidence": "\u68c0\u67e5\u7f3a\u5931\u8bc1\u636e",
  "Use next recommended actions": "\u4f7f\u7528\u4e0b\u4e00\u6b65\u5efa\u8bae",
  "Unresolved questions": "\u672a\u89e3\u51b3\u95ee\u9898",
  "No unresolved questions listed": "\u5c1a\u672a\u5217\u51fa\u672a\u89e3\u51b3\u95ee\u9898",
  "No risks or boundaries listed": "\u5c1a\u672a\u5217\u51fa\u98ce\u9669\u6216\u8fb9\u754c",
  "No main perspectives listed": "\u5c1a\u672a\u5217\u51fa\u4e3b\u8981\u89c2\u70b9",
  "No open disagreements listed": "\u5c1a\u672a\u5217\u51fa\u672a\u89e3\u51b3\u5206\u6b67",
  "No missing evidence listed": "\u5c1a\u672a\u5217\u51fa\u7f3a\u5931\u8bc1\u636e",
  "No answer requirements listed": "\u5c1a\u672a\u5217\u51fa\u7b54\u6848\u8981\u6c42",
  "No next recommended actions listed": "\u5c1a\u672a\u5217\u51fa\u4e0b\u4e00\u6b65\u5efa\u8bae",
  "No next recommended actions are listed yet.":
    "\u5c1a\u672a\u5217\u51fa\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
  "Nothing is listed for this section yet.":
    "\u6b64\u90e8\u5206\u5c1a\u672a\u5217\u51fa\u4efb\u4f55\u5185\u5bb9\u3002",
  "Perspective {number}": "\u89c6\u89d2 {number}",
  "This perspective is included in the current discussion material.":
    "\u6b64\u89c6\u89d2\u5df2\u5305\u542b\u5728\u5f53\u524d\u8ba8\u8bba\u6750\u6599\u4e2d\u3002",
  "Open disagreement {number}": "\u672a\u89e3\u51b3\u5206\u6b67 {number}",
  "Disagreement {number}": "\u5206\u6b67 {number}",
  "This disagreement is tracked, but it does not have a plain-language summary yet.":
    "\u6b64\u5206\u6b67\u5df2\u88ab\u8ffd\u8e2a\uff0c\u4f46\u5c1a\u65e0\u81ea\u7136\u8bed\u8a00\u6458\u8981\u3002",
  "Missing evidence {number}": "\u7f3a\u5931\u8bc1\u636e {number}",
  "Evidence gap {number}": "\u8bc1\u636e\u7f3a\u53e3 {number}",
  "This evidence gap still needs verification.":
    "\u6b64\u8bc1\u636e\u7f3a\u53e3\u4ecd\u9700\u9a8c\u8bc1\u3002",
  "Requirement {number}": "\u8981\u6c42 {number}",
  "This requirement should remain visible while reviewing the conclusion.":
    "\u5ba1\u9605\u7ed3\u8bba\u65f6\u5e94\u4fdd\u6301\u6b64\u8981\u6c42\u53ef\u89c1\u3002",
  "Needs verification": "\u9700\u8981\u9a8c\u8bc1",
  Resolved: "\u5df2\u89e3\u51b3",
  "{section} {number}": "{section} {number}",
  "No {item} listed": "\u5c1a\u672a\u5217\u51fa{item}",
  "{count} {item} listed": "\u5df2\u5217\u51fa {count} \u4e2a{item}",
  "No {item}": "\u6ca1\u6709{item}",
  "{count} {item}": "{count} \u4e2a{item}",
  "explored option": "\u5df2\u63a2\u7d22\u9009\u9879",
  "explored options": "\u5df2\u63a2\u7d22\u9009\u9879",
  "visible perspective": "\u53ef\u89c1\u89c2\u70b9",
  "visible perspectives": "\u53ef\u89c1\u89c2\u70b9",
  "open disagreement": "\u672a\u89e3\u51b3\u5206\u6b67",
  "open disagreements": "\u672a\u89e3\u51b3\u5206\u6b67",
  "risk or boundary": "\u98ce\u9669\u6216\u8fb9\u754c",
  "risks or boundaries": "\u98ce\u9669\u6216\u8fb9\u754c",
  "recommended next action": "\u4e0b\u4e00\u6b65\u5efa\u8bae",
  "recommended next actions": "\u4e0b\u4e00\u6b65\u5efa\u8bae",
  "open disagreement needs review": "\u9700\u8981\u5ba1\u9605\u7684\u672a\u89e3\u51b3\u5206\u6b67",
  "open disagreements need review": "\u9700\u8981\u5ba1\u9605\u7684\u672a\u89e3\u51b3\u5206\u6b67",
  "No evidence gaps listed": "\u5c1a\u672a\u5217\u51fa\u8bc1\u636e\u7f3a\u53e3",
  "{unresolved}/{total} still need checking": "{unresolved}/{total} \u4ecd\u9700\u6838\u67e5",
  "No evidence gaps are listed.": "\u5c1a\u672a\u5217\u51fa\u8bc1\u636e\u7f3a\u53e3\u3002",
  "{count} evidence gap has been checked.":
    "\u5df2\u6838\u67e5 {count} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u3002",
  "{count} evidence gaps have been checked.":
    "\u5df2\u6838\u67e5 {count} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u3002",
  "{unresolved} of {total} evidence gap needs verification":
    "{total} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u4e2d\u6709 {unresolved} \u4e2a\u9700\u8981\u9a8c\u8bc1",
  "{unresolved} of {total} evidence gap need verification":
    "{total} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u4e2d\u6709 {unresolved} \u4e2a\u9700\u8981\u9a8c\u8bc1",
  "{unresolved} of {total} evidence gaps needs verification":
    "{total} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u4e2d\u6709 {unresolved} \u4e2a\u9700\u8981\u9a8c\u8bc1",
  "{unresolved} of {total} evidence gaps need verification":
    "{total} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u4e2d\u6709 {unresolved} \u4e2a\u9700\u8981\u9a8c\u8bc1",
  "Discussion detail panels": "\u8ba8\u8bba\u8be6\u60c5\u9762\u677f",
  "Strongest current options accepted into the discussion so far.":
    "\u76ee\u524d\u5df2\u7eb3\u5165\u8ba8\u8bba\u7684\u6700\u5f3a\u5f53\u524d\u9009\u9879\u3002",
  "Unresolved objections and challenges that still constrain the discussion.":
    "\u4ecd\u7ea6\u675f\u8ba8\u8bba\u7684\u672a\u89e3\u51b3\u53cd\u5bf9\u610f\u89c1\u548c\u6311\u6218\u3002",
  "Explicit requirements for the current conclusion.":
    "\u5f53\u524d\u7ed3\u8bba\u7684\u660e\u786e\u8981\u6c42\u3002",
  "Risks and missing evidence": "\u98ce\u9669\u4e0e\u7f3a\u5931\u8bc1\u636e",
  "Evidence gaps and verification needs that should be checked before relying on the conclusion.":
    "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\u5e94\u68c0\u67e5\u7684\u8bc1\u636e\u7f3a\u53e3\u548c\u9a8c\u8bc1\u9700\u6c42\u3002",
  "No main perspectives": "\u5c1a\u65e0\u4e3b\u8981\u89c2\u70b9",
  "No main perspectives have been accepted into this discussion yet.":
    "\u5c1a\u672a\u6709\u4e3b\u8981\u89c2\u70b9\u88ab\u7eb3\u5165\u672c\u6b21\u8ba8\u8bba\u3002",
  "No open disagreements": "\u5c1a\u65e0\u672a\u89e3\u51b3\u5206\u6b67",
  "No open disagreements have been accepted into this discussion yet.":
    "\u5c1a\u672a\u6709\u672a\u89e3\u51b3\u5206\u6b67\u88ab\u7eb3\u5165\u672c\u6b21\u8ba8\u8bba\u3002",
  "No requirements": "\u5c1a\u65e0\u8981\u6c42",
  "No explicit requirements have been accepted into this discussion yet.":
    "\u5c1a\u672a\u6709\u660e\u786e\u8981\u6c42\u88ab\u7eb3\u5165\u672c\u6b21\u8ba8\u8bba\u3002",
  "No missing evidence": "\u5c1a\u65e0\u7f3a\u5931\u8bc1\u636e",
  "No evidence gaps have been accepted into this discussion yet.":
    "\u5c1a\u672a\u6709\u8bc1\u636e\u7f3a\u53e3\u88ab\u7eb3\u5165\u672c\u6b21\u8ba8\u8bba\u3002",
  "Main perspective": "\u4e3b\u8981\u89c2\u70b9",
  "Open disagreement": "\u672a\u89e3\u51b3\u5206\u6b67",
  "Evidence gap": "\u8bc1\u636e\u7f3a\u53e3",
  Requirement: "\u8981\u6c42",
  "{kind} {number}": "{kind} {number}",
  "Current state: {status}": "\u5f53\u524d\u72b6\u6001\uff1a{status}",
  "Visible in this discussion": "\u5728\u672c\u6b21\u8ba8\u8bba\u4e2d\u53ef\u89c1",
  "Still open": "\u4ecd\u672a\u89e3\u51b3",
  "Needs an answer": "\u9700\u8981\u56de\u7b54",
  "Advanced / Developer Mode": "\u9ad8\u7ea7 / \u5f00\u53d1\u8005\u6a21\u5f0f",
  "Checking daemon": "\u6b63\u5728\u68c0\u67e5\u5b88\u62a4\u8fdb\u7a0b",
  "Daemon unavailable": "\u5b88\u62a4\u8fdb\u7a0b\u4e0d\u53ef\u7528",
  "Views will retry when routes request data.": "\u9875\u9762\u8bf7\u6c42\u6570\u636e\u65f6\u4f1a\u91cd\u8bd5\u3002",
  "Daemon status unavailable": "\u5b88\u62a4\u8fdb\u7a0b\u72b6\u6001\u4e0d\u53ef\u7528",
  "Daemon online": "\u5b88\u62a4\u8fdb\u7a0b\u5728\u7ebf",
  "Loading discussion data": "\u6b63\u5728\u52a0\u8f7d\u8ba8\u8bba\u6570\u636e",
  "Could not load discussion data": "\u65e0\u6cd5\u52a0\u8f7d\u8ba8\u8bba\u6570\u636e",
  "View current conclusion": "\u67e5\u770b\u5f53\u524d\u7ed3\u8bba",
  "Open discussion": "\u6253\u5f00\u8ba8\u8bba",
  "Question": "\u95ee\u9898",
  "No discussion question is available yet.": "\u5c1a\u65e0\u53ef\u7528\u8ba8\u8bba\u95ee\u9898\u3002",
  "Last updated": "\u6700\u540e\u66f4\u65b0",
  "Step 1": "\u6b65\u9aa4 1",
  "Check": "\u68c0\u67e5",
  "Disagreements and evidence": "\u5206\u6b67\u4e0e\u8bc1\u636e",
  "Main perspectives": "\u4e3b\u8981\u89c2\u70b9",
  "Not ready": "\u672a\u5c31\u7eea",
  "Discussion status": "\u8ba8\u8bba\u72b6\u6001",
  "A user-facing summary of where the discussion currently stands.":
    "\u9762\u5411\u7528\u6237\u5c55\u793a\u5f53\u524d\u8ba8\u8bba\u8fdb\u5c55\u7684\u6458\u8981\u3002",
  "How progress is tracked": "\u8fdb\u5ea6\u5982\u4f55\u8ffd\u8e2a",
  "Optional status explanation for the visible discussion steps. Technical identifiers stay in Advanced mode.":
    "\u53ef\u89c1\u8ba8\u8bba\u6b65\u9aa4\u7684\u72b6\u6001\u8bf4\u660e\u3002\u6280\u672f\u6807\u8bc6\u4fdd\u7559\u5728\u9ad8\u7ea7\u6a21\u5f0f\u4e2d\u3002",
  "What this discussion status means": "\u8fd9\u4e2a\u8ba8\u8bba\u72b6\u6001\u662f\u4ec0\u4e48\u610f\u601d",
  "Status guide": "\u72b6\u6001\u8bf4\u660e",
  "Plain-language meanings for the status labels used in this page.":
    "\u672c\u9875\u72b6\u6001\u6807\u7b7e\u7684\u81ea\u7136\u8bed\u8a00\u542b\u4e49\u3002",
  "Created": "\u5df2\u521b\u5efa",
  "The discussion exists, but the deliberation steps have not started yet.":
    "\u8ba8\u8bba\u5df2\u5b58\u5728\uff0c\u4f46\u5ba1\u8bae\u6b65\u9aa4\u5c1a\u672a\u5f00\u59cb\u3002",
  "No work has been recorded for that part of the discussion.":
    "\u8be5\u90e8\u5206\u8ba8\u8bba\u5c1a\u672a\u8bb0\u5f55\u4efb\u4f55\u5de5\u4f5c\u3002",
  "Setup needed": "\u9700\u8981\u914d\u7f6e",
  "This discussion cannot continue until the required setup is available. Setup details stay in Advanced mode.":
    "\u5728\u6240\u9700\u914d\u7f6e\u53ef\u7528\u4e4b\u524d\uff0c\u6b64\u8ba8\u8bba\u65e0\u6cd5\u7ee7\u7eed\u3002\u914d\u7f6e\u7ec6\u8282\u4fdd\u7559\u5728\u9ad8\u7ea7\u6a21\u5f0f\u4e2d\u3002",
  "Discussion progress": "\u8ba8\u8bba\u8fdb\u5ea6",
  "Progress": "\u8fdb\u5ea6",
  "Each step corresponds to a core Deliberum concept, presented in user language.":
    "\u6bcf\u4e2a\u6b65\u9aa4\u90fd\u5bf9\u5e94\u4e00\u4e2a Deliberum \u6838\u5fc3\u6982\u5ff5\uff0c\u5e76\u4ee5\u7528\u6237\u8bed\u8a00\u5448\u73b0\u3002",
  "Discussion setup": "\u8ba8\u8bba\u8bbe\u7f6e",
  "Original brief and status details for review. The main room keeps the live discussion flow first.":
    "\u7528\u4e8e\u5ba1\u9605\u7684\u539f\u59cb\u7b80\u62a5\u548c\u72b6\u6001\u8be6\u60c5\u3002\u4e3b\u8ba8\u8bba\u5ba4\u4f18\u5148\u5448\u73b0\u5b9e\u65f6\u8ba8\u8bba\u6d41\u7a0b\u3002",
  "The question, goals, and constraints are visible before discussion work begins.":
    "\u95ee\u9898\u3001\u76ee\u6807\u548c\u7ea6\u675f\u4f1a\u5728\u8ba8\u8bba\u5de5\u4f5c\u5f00\u59cb\u524d\u4fdd\u6301\u53ef\u89c1\u3002",
  "The question, goals, constraints, and expected result that anchor this discussion.":
    "\u652f\u6491\u672c\u6b21\u8ba8\u8bba\u7684\u95ee\u9898\u3001\u76ee\u6807\u3001\u7ea6\u675f\u548c\u671f\u671b\u7ed3\u679c\u3002",
  "No discussion brief visible yet": "\u5c1a\u65e0\u53ef\u89c1\u8ba8\u8bba\u7b80\u62a5",
  "Continue the discussion after the brief is available.": "\u8bf7\u5728\u7b80\u62a5\u53ef\u7528\u540e\u7ee7\u7eed\u8ba8\u8bba\u3002",
  "Discussion {number}": "\u8ba8\u8bba {number}",
  "Review the status, perspectives, disagreements, evidence, conclusion, and next actions.":
    "\u67e5\u770b\u72b6\u6001\u3001\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8bc1\u636e\u3001\u7ed3\u8bba\u548c\u4e0b\u4e00\u6b65\u3002",
  "Open a discussion room and review its brief, perspectives, disagreements, requirements, evidence, conclusion, and next actions.":
    "\u6253\u5f00\u8ba8\u8bba\u5ba4\uff0c\u67e5\u770b\u7b80\u62a5\u3001\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u3001\u7ed3\u8bba\u548c\u4e0b\u4e00\u6b65\u3002",
  "Start a discussion to create the first deliberation.": "\u5f00\u59cb\u4e00\u4e2a\u8ba8\u8bba\u4ee5\u521b\u5efa\u9996\u6b21\u5ba1\u8bae\u3002",
  "Next step": "\u4e0b\u4e00\u6b65",
  "Start with the current conclusion, then check the visible disagreements, requirements, and evidence gaps before relying on it.":
    "\u5148\u67e5\u770b\u5f53\u524d\u7ed3\u8bba\uff0c\u518d\u68c0\u67e5\u53ef\u89c1\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u7f3a\u53e3\uff0c\u7136\u540e\u518d\u51b3\u5b9a\u662f\u5426\u4f9d\u8d56\u5b83\u3002",
  "Start with the current conclusion, then check visible disagreements, requirements, risks, and missing evidence before relying on it.":
    "\u5148\u67e5\u770b\u5f53\u524d\u7ed3\u8bba\uff0c\u518d\u68c0\u67e5\u53ef\u89c1\u5206\u6b67\u3001\u8981\u6c42\u3001\u98ce\u9669\u548c\u7f3a\u5931\u8bc1\u636e\uff0c\u7136\u540e\u518d\u51b3\u5b9a\u662f\u5426\u4f9d\u8d56\u5b83\u3002",
  "Continue the discussion so independent first responses, main perspectives, disagreements, requirements, evidence, and a current conclusion can be produced.":
    "\u7ee7\u7eed\u8ba8\u8bba\uff0c\u4ee5\u751f\u6210\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3001\u4e3b\u8981\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u548c\u5f53\u524d\u7ed3\u8bba\u3002",
  "Check discussion progress": "\u67e5\u770b\u8ba8\u8bba\u8fdb\u5ea6",
  "Discussion steps are running. Open the room to see which perspectives, disagreements, evidence checks, and conclusion work have changed.":
    "\u8ba8\u8bba\u6b65\u9aa4\u6b63\u5728\u8fd0\u884c\u3002\u6253\u5f00\u8ba8\u8bba\u5ba4\uff0c\u67e5\u770b\u54ea\u4e9b\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8bc1\u636e\u6838\u67e5\u548c\u7ed3\u8bba\u5de5\u4f5c\u5df2\u53d8\u5316\u3002",
  "Some discussion steps are complete. Continue the guided flow until the current conclusion, disagreements, evidence, risks, and next actions are ready.":
    "\u90e8\u5206\u8ba8\u8bba\u6b65\u9aa4\u5df2\u5b8c\u6210\u3002\u8bf7\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u6d41\u7a0b\uff0c\u76f4\u5230\u5f53\u524d\u7ed3\u8bba\u3001\u5206\u6b67\u3001\u8bc1\u636e\u3001\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u5c31\u7eea\u3002",
  "There are unresolved disagreements that still constrain the current conclusion.":
    "\u4ecd\u6709\u672a\u89e3\u51b3\u5206\u6b67\u7ea6\u675f\u5f53\u524d\u7ed3\u8bba\u3002",
  "Missing or unchecked evidence should be resolved before the conclusion is treated as reliable.":
    "\u5728\u628a\u7ed3\u8bba\u89c6\u4e3a\u53ef\u9760\u4e4b\u524d\uff0c\u5e94\u89e3\u51b3\u7f3a\u5931\u6216\u672a\u6838\u67e5\u7684\u8bc1\u636e\u3002",
  "Requirements that are not satisfied yet should be resolved or explicitly acknowledged in the conclusion.":
    "\u5c1a\u672a\u6ee1\u8db3\u7684\u8981\u6c42\u5e94\u88ab\u89e3\u51b3\uff0c\u6216\u5728\u7ed3\u8bba\u4e2d\u660e\u786e\u8bf4\u660e\u3002",
  "Discussion could not continue": "\u8ba8\u8bba\u65e0\u6cd5\u7ee7\u7eed",
  "Discussion paused": "\u8ba8\u8bba\u5df2\u6682\u505c",
  "Discussion steps completed": "\u8ba8\u8bba\u6b65\u9aa4\u5df2\u5b8c\u6210",
  "The discussion stopped before every requested step finished. Review the visible steps below or open Advanced details for the technical reason.":
    "\u8ba8\u8bba\u5728\u6240\u6709\u8bf7\u6c42\u6b65\u9aa4\u5b8c\u6210\u524d\u505c\u6b62\u3002\u8bf7\u67e5\u770b\u4e0b\u65b9\u53ef\u89c1\u6b65\u9aa4\uff0c\u6216\u6253\u5f00\u9ad8\u7ea7\u8be6\u60c5\u67e5\u770b\u6280\u672f\u539f\u56e0\u3002",
  "The guided discussion steps were recorded. Review the updated perspectives, disagreements, requirements, and current conclusion.":
    "\u5df2\u8bb0\u5f55\u5f15\u5bfc\u5f0f\u8ba8\u8bba\u6b65\u9aa4\u3002\u8bf7\u67e5\u770b\u66f4\u65b0\u540e\u7684\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u5f53\u524d\u7ed3\u8bba\u3002",
  "Stop reason": "\u505c\u6b62\u539f\u56e0",
  "No visible discussion steps": "\u6ca1\u6709\u53ef\u89c1\u8ba8\u8bba\u6b65\u9aa4",
  "No user-facing step updates were returned for this request.":
    "\u672c\u6b21\u8bf7\u6c42\u6ca1\u6709\u8fd4\u56de\u9762\u5411\u7528\u6237\u7684\u6b65\u9aa4\u66f4\u65b0\u3002",
  "Updated discussion steps": "\u5df2\u66f4\u65b0\u7684\u8ba8\u8bba\u6b65\u9aa4",
  "What changed": "\u53d1\u751f\u4e86\u4ec0\u4e48\u53d8\u5316",
  "Readable summary of the discussion work that just ran.":
    "\u521a\u521a\u8fd0\u884c\u7684\u8ba8\u8bba\u5de5\u4f5c\u7684\u53ef\u8bfb\u6458\u8981\u3002",
  "Initial perspectives were collected before any single answer could anchor the discussion.":
    "\u5728\u4efb\u4f55\u5355\u4e00\u7b54\u6848\u951a\u5b9a\u8ba8\u8bba\u4e4b\u524d\uff0c\u5df2\u6536\u96c6\u521d\u59cb\u89c6\u89d2\u3002",
  "The discussion material was organized into options, disagreements, requirements, and evidence needs.":
    "\u8ba8\u8bba\u6750\u6599\u5df2\u6574\u7406\u4e3a\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002",
  "Candidate material was checked against open disagreements and answer requirements.":
    "\u5019\u9009\u6750\u6599\u5df2\u6839\u636e\u672a\u89e3\u51b3\u5206\u6b67\u548c\u7b54\u6848\u8981\u6c42\u8fdb\u884c\u68c0\u67e5\u3002",
  "Open evidence needs were routed to reported checks without implying verified truth.":
    "\u5f00\u653e\u8bc1\u636e\u9700\u6c42\u5df2\u8f6c\u5165\u62a5\u544a\u7684\u6838\u67e5\u5de5\u4f5c\uff0c\u4f46\u4e0d\u6697\u793a\u5df2\u7ecf\u9a8c\u8bc1\u4e3a\u771f\u3002",
  "Option quality": "\u9009\u9879\u8d28\u91cf",
  "Known weaknesses were used to strengthen current options before conclusion work.":
    "\u5728\u8fdb\u5165\u7ed3\u8bba\u5de5\u4f5c\u524d\uff0c\u5df2\u7528\u5df2\u77e5\u5f31\u70b9\u5f3a\u5316\u5f53\u524d\u9009\u9879\u3002",
  "A provisional conclusion and risk review were compiled for review.":
    "\u5df2\u6574\u7406\u53ef\u4f9b\u5ba1\u9605\u7684\u4e34\u65f6\u7ed3\u8bba\u548c\u98ce\u9669\u5ba1\u67e5\u3002",
  "A discussion step was updated. Advanced details include the original step name.":
    "\u4e00\u4e2a\u8ba8\u8bba\u6b65\u9aa4\u5df2\u66f4\u65b0\u3002\u9ad8\u7ea7\u8be6\u60c5\u5305\u542b\u539f\u59cb\u6b65\u9aa4\u540d\u79f0\u3002",
  Revealed: "\u5df2\u63ed\u793a",
  "Independent first responses have been revealed for review.":
    "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u5df2\u63ed\u793a\uff0c\u53ef\u4f9b\u5ba1\u9605\u3002",
  "This discussion step has no recorded work yet.": "\u6b64\u8ba8\u8bba\u6b65\u9aa4\u5c1a\u672a\u8bb0\u5f55\u5de5\u4f5c\u3002",
  "This discussion step has been completed.": "\u6b64\u8ba8\u8bba\u6b65\u9aa4\u5df2\u5b8c\u6210\u3002",
  Failed: "\u5931\u8d25",
  "This discussion step could not be processed safely.": "\u6b64\u8ba8\u8bba\u6b65\u9aa4\u65e0\u6cd5\u88ab\u5b89\u5168\u5904\u7406\u3002",
  "Status reported for this discussion step.": "\u5df2\u62a5\u544a\u6b64\u8ba8\u8bba\u6b65\u9aa4\u7684\u72b6\u6001\u3002",
  Unavailable: "\u4e0d\u53ef\u7528",
  "No readable status was returned for this discussion step.":
    "\u6b64\u8ba8\u8bba\u6b65\u9aa4\u6ca1\u6709\u8fd4\u56de\u53ef\u8bfb\u72b6\u6001\u3002",
  "Ready to review: current conclusion is available.": "\u53ef\u5ba1\u9605\uff1a\u5f53\u524d\u7ed3\u8bba\u5df2\u53ef\u7528\u3002",
  "In progress: discussion steps are currently running.": "\u8fdb\u884c\u4e2d\uff1a\u8ba8\u8bba\u6b65\u9aa4\u6b63\u5728\u8fd0\u884c\u3002",
  "Created: discussion exists, deliberation steps have not started.":
    "\u5df2\u521b\u5efa\uff1a\u8ba8\u8bba\u5df2\u5b58\u5728\uff0c\u5ba1\u8bae\u6b65\u9aa4\u5c1a\u672a\u5f00\u59cb\u3002",
  "Discussion is ready to review": "\u8ba8\u8bba\u5df2\u53ef\u5ba1\u9605",
  "The guided discussion has produced a current conclusion. Review it first; refresh the steps only when you want to update the discussion with the same brief.":
    "\u5f15\u5bfc\u5f0f\u8ba8\u8bba\u5df2\u751f\u6210\u5f53\u524d\u7ed3\u8bba\u3002\u8bf7\u5148\u5ba1\u9605\uff1b\u53ea\u6709\u5728\u60f3\u57fa\u4e8e\u540c\u4e00\u7b80\u62a5\u66f4\u65b0\u8ba8\u8bba\u65f6\u624d\u5237\u65b0\u6b65\u9aa4\u3002",
  "Review the current conclusion": "\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba",
  "Main perspectives, open disagreements, requirements, evidence and verification, risk review, and next recommended actions are available below and on the conclusion page.":
    "\u4e3b\u8981\u89c2\u70b9\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u4e0e\u6838\u67e5\u3001\u98ce\u9669\u5ba1\u67e5\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u53ef\u5728\u4e0b\u65b9\u548c\u7ed3\u8bba\u9875\u67e5\u770b\u3002",
  "Refresh discussion steps": "\u5237\u65b0\u8ba8\u8bba\u6b65\u9aa4",
  "Continue the guided discussion so perspectives, disagreements, requirements, evidence and verification, risk review, and conclusion can appear.":
    "\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u4ee5\u5448\u73b0\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u4e0e\u6838\u67e5\u3001\u98ce\u9669\u5ba1\u67e5\u548c\u7ed3\u8bba\u3002",
  "Continue the full guided discussion": "\u7ee7\u7eed\u5b8c\u6574\u5f15\u5bfc\u5f0f\u8ba8\u8bba",
  "Collects independent first responses, organizes main perspectives, reviews requirements, checks evidence needs, and compiles a provisional conclusion.":
    "\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\uff0c\u6574\u7406\u4e3b\u8981\u89c2\u70b9\uff0c\u5ba1\u9605\u8981\u6c42\uff0c\u68c0\u67e5\u8bc1\u636e\u9700\u6c42\uff0c\u5e76\u7f16\u5236\u4e34\u65f6\u7ed3\u8bba\u3002",
  "Continue guided discussion": "\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba",
  "Room activity": "\u8ba8\u8bba\u5ba4\u6d3b\u52a8",
  "Readable discussion flow": "\u53ef\u8bfb\u8ba8\u8bba\u6d41\u7a0b",
  "Loading room activity": "\u6b63\u5728\u52a0\u8f7d\u8ba8\u8bba\u5ba4\u6d3b\u52a8",
  "Could not load room activity": "\u65e0\u6cd5\u52a0\u8f7d\u8ba8\u8bba\u5ba4\u6d3b\u52a8",
  "No room activity visible yet": "\u5c1a\u65e0\u53ef\u89c1\u8ba8\u8bba\u5ba4\u6d3b\u52a8",
  "Continue the discussion so the room can show participant responses and discussion updates.":
    "\u7ee7\u7eed\u8ba8\u8bba\u540e\uff0c\u8ba8\u8bba\u5ba4\u4f1a\u663e\u793a\u53c2\u4e0e\u8005\u56de\u5e94\u548c\u8ba8\u8bba\u66f4\u65b0\u3002",
  "Core discussion stages": "\u6838\u5fc3\u8ba8\u8bba\u9636\u6bb5",
  "Structured deliberation progress": "\u7ed3\u6784\u5316\u5ba1\u8bae\u8fdb\u5ea6",
  "Discussion brief published": "\u8ba8\u8bba\u7b80\u62a5\u5df2\u53d1\u5e03",
  "The discussion brief is available for everyone in the room.":
    "\u8ba8\u8bba\u5ba4\u4e2d\u7684\u6240\u6709\u4eba\u90fd\u53ef\u4ee5\u67e5\u770b\u8ba8\u8bba\u7b80\u62a5\u3002",
  "Independent first responses opened": "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u5df2\u5f00\u542f",
  "Participants can respond separately before seeing one another's answers.":
    "\u53c2\u4e0e\u8005\u53ef\u4ee5\u5148\u5206\u522b\u56de\u5e94\uff0c\u518d\u770b\u5230\u5f7c\u6b64\u7b54\u6848\u3002",
  "Independent response submitted": "\u72ec\u7acb\u56de\u5e94\u5df2\u63d0\u4ea4",
  "This response is sealed until the independent first responses are revealed.":
    "\u5728\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u63ed\u793a\u524d\uff0c\u6b64\u56de\u5e94\u4fdd\u6301\u5c01\u5b58\u3002",
  "Independent first responses revealed": "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u5df2\u63ed\u793a",
  "The independent responses are now available for review.":
    "\u72ec\u7acb\u56de\u5e94\u73b0\u5728\u53ef\u4f9b\u5ba1\u9605\u3002",
  "Main perspectives organized": "\u4e3b\u8981\u89c2\u70b9\u5df2\u6574\u7406",
  "The revealed responses were organized into options, disagreements, requirements, and evidence needs.":
    "\u5df2\u63ed\u793a\u56de\u5e94\u88ab\u6574\u7406\u4e3a\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002",
  "Discussion material accepted for review": "\u8ba8\u8bba\u6750\u6599\u5df2\u63a5\u53d7\u5ba1\u9605",
  "The room accepted this discussion material as part of the current working view.":
    "\u8ba8\u8bba\u5ba4\u5df2\u5c06\u8fd9\u4efd\u8ba8\u8bba\u6750\u6599\u7eb3\u5165\u5f53\u524d\u5de5\u4f5c\u89c6\u56fe\u3002",
  "Open disagreement recorded": "\u672a\u89e3\u51b3\u5206\u6b67\u5df2\u8bb0\u5f55",
  "A challenge was recorded against the current discussion material.":
    "\u5df2\u9488\u5bf9\u5f53\u524d\u8ba8\u8bba\u6750\u6599\u8bb0\u5f55\u4e00\u6761\u6311\u6218\u3002",
  "Evidence check recorded": "\u8bc1\u636e\u6838\u67e5\u5df2\u8bb0\u5f55",
  "An evidence check result was added to the discussion.":
    "\u4e00\u6761\u8bc1\u636e\u6838\u67e5\u7ed3\u679c\u5df2\u52a0\u5165\u8ba8\u8bba\u3002",
  "Current conclusion drafted": "\u5f53\u524d\u7ed3\u8bba\u5df2\u8d77\u8349",
  "A reviewable conclusion draft was prepared from the current discussion material.":
    "\u5df2\u6839\u636e\u5f53\u524d\u8ba8\u8bba\u6750\u6599\u51c6\u5907\u53ef\u5ba1\u9605\u7684\u7ed3\u8bba\u8349\u7a3f\u3002",
  "Risk review recorded": "\u98ce\u9669\u5ba1\u67e5\u5df2\u8bb0\u5f55",
  "A risk review was recorded for the current conclusion.":
    "\u5df2\u4e3a\u5f53\u524d\u7ed3\u8bba\u8bb0\u5f55\u4e00\u6761\u98ce\u9669\u5ba1\u67e5\u3002",
  "This participant response is available for review in the room.":
    "\u6b64\u53c2\u4e0e\u8005\u56de\u5e94\u53ef\u5728\u8ba8\u8bba\u5ba4\u4e2d\u5ba1\u9605\u3002"
};

type I18nContextValue = {
  language: WebLanguage;
  setLanguage: (language: WebLanguage) => void;
  t: (message: string, values?: TranslationValues) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({
  initialLanguage,
  children
}: {
  initialLanguage?: WebLanguage;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<WebLanguage>(() =>
    resolveInitialLanguage(initialLanguage)
  );
  const setLanguage = useCallback((nextLanguage: WebLanguage) => {
    setLanguageState(nextLanguage);
  }, []);
  const t = useCallback(
    (message: string, values?: TranslationValues) =>
      interpolateTranslation(translateMessage(language, message), values),
    [language]
  );
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t
    }),
    [language, setLanguage, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }

  return context;
}

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="du-language-switcher">
      <span>{t("Language")}</span>
      <select
        aria-label={t("Language")}
        value={language}
        onChange={(event) => setLanguage(event.currentTarget.value as WebLanguage)}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function resolveInitialLanguage(initialLanguage: WebLanguage | undefined): WebLanguage {
  if (initialLanguage && isSupportedLanguage(initialLanguage)) {
    return initialLanguage;
  }

  return "en";
}

function isSupportedLanguage(value: unknown): value is WebLanguage {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as WebLanguage);
}

function translateMessage(language: WebLanguage, message: string): string {
  if (language === "zh-CN") {
    return ZH_CN_TRANSLATIONS[message] ?? message;
  }

  return message;
}

function interpolateTranslation(message: string, values?: TranslationValues): string {
  if (!values) {
    return message;
  }

  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    message
  );
}
