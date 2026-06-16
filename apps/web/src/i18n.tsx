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
export const WEB_LANGUAGE_STORAGE_KEY = "deliberum.web.language" as const;

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
  "Organizer recovery notice": "\u7ec4\u7ec7\u5668\u6062\u590d\u63d0\u793a",
  "Recovery note": "\u6062\u590d\u63d0\u793a",
  "Discussion organizer used a safe fallback":
    "\u8ba8\u8bba\u7ec4\u7ec7\u5668\u4f7f\u7528\u4e86\u5b89\u5168\u964d\u7ea7",
  "The model returned organizer output Deliberum could not use directly, so this view was rebuilt from the independent first responses. Treat the conclusion as provisional and check disagreements, missing evidence, and risks before relying on it.":
    "\u6a21\u578b\u8fd4\u56de\u7684\u7ec4\u7ec7\u5668\u8f93\u51fa\u65e0\u6cd5\u88ab Deliberum \u76f4\u63a5\u4f7f\u7528\uff0c\u56e0\u6b64\u6b64\u89c6\u56fe\u662f\u6839\u636e\u72ec\u7acb\u9996\u6b21\u56de\u5e94\u91cd\u5efa\u7684\u3002\u8bf7\u5c06\u7ed3\u8bba\u89c6\u4e3a\u4e34\u65f6\u7ed3\u8bba\uff0c\u5e76\u5728\u4f9d\u8d56\u524d\u68c0\u67e5\u5206\u6b67\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u98ce\u9669\u3002",
  "Start a discussion": "\u5f00\u59cb\u8ba8\u8bba",
  "Preview participants and review path":
    "\u9884\u89c8\u53c2\u4e0e\u8005\u548c\u5ba1\u67e5\u8def\u5f84",
  "Model and participant setup": "\u6a21\u578b\u548c\u53c2\u4e0e\u8005\u8bbe\u7f6e",
  "How this discussion will continue":
    "\u8fd9\u4e2a\u8ba8\u8bba\u5c06\u5982\u4f55\u7ee7\u7eed",
  "Multi-perspective deliberation for better decisions":
    "\u7528\u591a\u89c6\u89d2\u5ba1\u8bae\u505a\u51fa\u66f4\u597d\u51b3\u7b56",
  "Continue discussions": "\u7ee7\u7eed\u8ba8\u8bba",
  "Continue existing discussions": "\u7ee7\u7eed\u5df2\u6709\u8ba8\u8bba",
  "Setup / Models": "\u8bbe\u7f6e / \u6a21\u578b",
  "Open Setup / Models": "\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b",
  "Ready to use Deliberum": "Deliberum \u4f7f\u7528\u5c31\u7eea",
  "One place to see whether the local service, model setup, and discussion history are ready.":
    "\u5728\u4e00\u4e2a\u5730\u65b9\u67e5\u770b\u672c\u5730\u670d\u52a1\u3001\u6a21\u578b\u8bbe\u7f6e\u548c\u8ba8\u8bba\u5386\u53f2\u662f\u5426\u5df2\u5c31\u7eea\u3002",
  "Product readiness": "\u4ea7\u54c1\u5c31\u7eea\u72b6\u6001",
  "First-use path": "\u9996\u6b21\u4f7f\u7528\u8def\u5f84",
  "From setup to discussion room": "\u4ece\u8bbe\u7f6e\u5230\u8ba8\u8bba\u5ba4",
  "Follow the shortest usable path: connect the local service, confirm model and participant readiness, then start the discussion room.":
    "\u6309\u6700\u77ed\u53ef\u7528\u8def\u5f84\u64cd\u4f5c\uff1a\u8fde\u63a5\u672c\u5730\u670d\u52a1\u3001\u786e\u8ba4\u6a21\u578b\u548c\u53c2\u4e0e\u8005\u5c31\u7eea\uff0c\u7136\u540e\u5f00\u59cb\u8ba8\u8bba\u5ba4\u3002",
  "Step 2": "\u6b65\u9aa4 2",
  "Step 3": "\u6b65\u9aa4 3",
  "Step 4": "\u6b65\u9aa4 4",
  "Local service": "\u672c\u5730\u670d\u52a1",
  "Checking local service": "\u6b63\u5728\u68c0\u67e5\u672c\u5730\u670d\u52a1",
  "Web is checking whether the local system is reachable.":
    "Web \u6b63\u5728\u68c0\u67e5\u672c\u5730\u7cfb\u7edf\u662f\u5426\u53ef\u8bbf\u95ee\u3002",
  "Local service unavailable": "\u672c\u5730\u670d\u52a1\u4e0d\u53ef\u7528",
  "Local service status unavailable":
    "\u672c\u5730\u670d\u52a1\u72b6\u6001\u4e0d\u53ef\u7528",
  "Open Setup / Models to check the local service and model configuration.":
    "\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b\u4ee5\u68c0\u67e5\u672c\u5730\u670d\u52a1\u548c\u6a21\u578b\u914d\u7f6e\u3002",
  "Local service connected": "\u672c\u5730\u670d\u52a1\u5df2\u8fde\u63a5",
  "Web can read setup status from the local system.":
    "Web \u53ef\u4ee5\u4ece\u672c\u5730\u7cfb\u7edf\u8bfb\u53d6\u8bbe\u7f6e\u72b6\u6001\u3002",
  "Web can read setup, discussions, and model readiness from this machine.":
    "Web \u53ef\u4ee5\u4ece\u8fd9\u53f0\u673a\u5668\u8bfb\u53d6\u8bbe\u7f6e\u3001\u8ba8\u8bba\u548c\u6a21\u578b\u5c31\u7eea\u72b6\u6001\u3002",
  "Open Setup / Models for the local start command, then return here.":
    "\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b\u67e5\u770b\u672c\u5730\u542f\u52a8\u547d\u4ee4\uff0c\u7136\u540e\u56de\u5230\u8fd9\u91cc\u3002",
  "Start the local service before configuring models.":
    "\u914d\u7f6e\u6a21\u578b\u524d\uff0c\u8bf7\u5148\u542f\u52a8\u672c\u5730\u670d\u52a1\u3002",
  "Start the local service, then check again.":
    "\u8bf7\u5148\u542f\u52a8\u672c\u5730\u670d\u52a1\uff0c\u7136\u540e\u518d\u6b21\u68c0\u67e5\u3002",
  "Model setup": "\u6a21\u578b\u8bbe\u7f6e",
  "Model setup unavailable": "\u6a21\u578b\u8bbe\u7f6e\u4e0d\u53ef\u7528",
  "Web is checking whether demo or model-backed participants are ready.":
    "Web \u6b63\u5728\u68c0\u67e5\u6f14\u793a\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\u662f\u5426\u5df2\u5c31\u7eea\u3002",
  "Real model provider ready": "\u771f\u5b9e\u6a21\u578b\u63d0\u4f9b\u65b9\u5df2\u5c31\u7eea",
  "Model provider ready": "\u6a21\u578b\u63d0\u4f9b\u65b9\u5df2\u5c31\u7eea",
  "Demo ready, model setup still needed":
    "\u6f14\u793a\u5df2\u5c31\u7eea\uff0c\u4ecd\u9700\u6a21\u578b\u8bbe\u7f6e",
  "Configured model participants can answer new discussions.":
    "\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u53ef\u4ee5\u56de\u7b54\u65b0\u7684\u8ba8\u8bba\u3002",
  "A real provider can answer with configured model participants.":
    "\u771f\u5b9e\u63d0\u4f9b\u65b9\u53ef\u4ee5\u7528\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u56de\u7b54\u3002",
  "Demo discussion ready": "\u6f14\u793a\u8ba8\u8bba\u5df2\u5c31\u7eea",
  "Demo participants can start now; finish provider setup before relying on real model perspectives.":
    "\u6f14\u793a\u53c2\u4e0e\u8005\u73b0\u5728\u53ef\u4ee5\u5f00\u59cb\uff1b\u4f9d\u8d56\u771f\u5b9e\u6a21\u578b\u89c6\u89d2\u524d\u8bf7\u5148\u5b8c\u6210\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u3002",
  "You can try the room now, then add a provider for real model responses.":
    "\u73b0\u5728\u53ef\u4ee5\u8bd5\u7528\u8ba8\u8bba\u5ba4\uff0c\u7136\u540e\u6dfb\u52a0\u63d0\u4f9b\u65b9\u4ee5\u83b7\u5f97\u771f\u5b9e\u6a21\u578b\u56de\u7b54\u3002",
  "Built-in demo participants can start a walkthrough immediately.":
    "\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005\u53ef\u4ee5\u7acb\u5373\u5f00\u59cb\u6f14\u793a\u6d41\u7a0b\u3002",
  "Provider setup needed": "\u9700\u8981\u63d0\u4f9b\u65b9\u8bbe\u7f6e",
  "Save API key, base URL, and model before relying on real model participants.":
    "\u4f9d\u8d56\u771f\u5b9e\u6a21\u578b\u53c2\u4e0e\u8005\u524d\uff0c\u8bf7\u5148\u4fdd\u5b58 API key\u3001base URL \u548c\u6a21\u578b\u3002",
  "Save an API key, base URL, and model before relying on real model perspectives.":
    "\u4f9d\u8d56\u771f\u5b9e\u6a21\u578b\u89c6\u89d2\u524d\uff0c\u8bf7\u5148\u4fdd\u5b58 API key\u3001Base URL \u548c\u6a21\u578b\u3002",
  "Configure the model provider in Web.":
    "\u5728 Web \u4e2d\u914d\u7f6e\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "Participants and review roles ready":
    "\u53c2\u4e0e\u8005\u548c\u5ba1\u67e5\u89d2\u8272\u5df2\u5c31\u7eea",
  "Model perspectives can answer first, then local review roles can review disagreements, evidence, risks, and the conclusion.":
    "\u6a21\u578b\u89c6\u89d2\u53ef\u4ee5\u5148\u56de\u7b54\uff0c\u7136\u540e\u672c\u5730\u5ba1\u67e5\u89d2\u8272\u53ef\u4ee5\u5ba1\u67e5\u5206\u6b67\u3001\u8bc1\u636e\u3001\u98ce\u9669\u548c\u7ed3\u8bba\u3002",
  "Model perspectives can answer first, then Reviewer, Evidence checker, Risk reviewer, and Conclusion writer can review the result.":
    "\u6a21\u578b\u89c6\u89d2\u53ef\u4ee5\u5148\u56de\u7b54\uff0c\u7136\u540e\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u3001\u98ce\u9669\u5ba1\u67e5\u8005\u548c\u7ed3\u8bba\u8d77\u8349\u8005\u53ef\u4ee5\u5ba1\u67e5\u7ed3\u679c\u3002",
  "Model participants ready": "\u6a21\u578b\u53c2\u4e0e\u8005\u5df2\u5c31\u7eea",
  "Model perspectives can answer first; finish review role setup before relying on conclusions.":
    "\u6a21\u578b\u89c6\u89d2\u53ef\u4ee5\u5148\u56de\u7b54\uff1b\u4f9d\u8d56\u7ed3\u8bba\u524d\u8bf7\u5b8c\u6210\u5ba1\u67e5\u89d2\u8272\u8bbe\u7f6e\u3002",
  "Demo room roles ready": "\u6f14\u793a\u8ba8\u8bba\u5ba4\u89d2\u8272\u5df2\u5c31\u7eea",
  "Built-in perspectives and local review roles can show the full room flow without provider calls.":
    "\u5185\u7f6e\u89c6\u89d2\u548c\u672c\u5730\u5ba1\u67e5\u89d2\u8272\u53ef\u4ee5\u5728\u4e0d\u8c03\u7528\u63d0\u4f9b\u65b9\u7684\u60c5\u51b5\u4e0b\u5c55\u793a\u5b8c\u6574\u8ba8\u8bba\u5ba4\u6d41\u7a0b\u3002",
  "Participants need setup": "\u53c2\u4e0e\u8005\u9700\u8981\u8bbe\u7f6e",
  "Configure a participant source before starting a useful discussion room.":
    "\u5f00\u59cb\u6709\u7528\u7684\u8ba8\u8bba\u5ba4\u524d\uff0c\u8bf7\u5148\u914d\u7f6e\u53c2\u4e0e\u8005\u6765\u6e90\u3002",
  "Checking participant readiness":
    "\u6b63\u5728\u68c0\u67e5\u53c2\u4e0e\u8005\u5c31\u7eea\u72b6\u6001",
  "Participant readiness appears after model setup loads.":
    "\u6a21\u578b\u8bbe\u7f6e\u52a0\u8f7d\u540e\u4f1a\u663e\u793a\u53c2\u4e0e\u8005\u5c31\u7eea\u72b6\u6001\u3002",
  "Start the real discussion": "\u5f00\u59cb\u771f\u5b9e\u8ba8\u8bba",
  "Open the discussion room with configured model participants selected.":
    "\u6253\u5f00\u8ba8\u8bba\u5ba4\uff0c\u5e76\u9009\u4e2d\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Start a demo discussion": "\u5f00\u59cb\u6f14\u793a\u8ba8\u8bba",
  "Open the discussion room with built-in demo participants.":
    "\u6253\u5f00\u8ba8\u8bba\u5ba4\uff0c\u5e76\u4f7f\u7528\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005\u3002",
  "Complete setup before creating useful discussion material.":
    "\u521b\u5efa\u6709\u7528\u7684\u8ba8\u8bba\u6750\u6599\u524d\uff0c\u8bf7\u5148\u5b8c\u6210\u8bbe\u7f6e\u3002",
  "Discussion source unavailable": "\u8ba8\u8bba\u6765\u6e90\u4e0d\u53ef\u7528",
  "Complete model setup before starting useful discussions.":
    "\u5f00\u59cb\u6709\u7528\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u5b8c\u6210\u6a21\u578b\u8bbe\u7f6e\u3002",
  "Discussion history": "\u8ba8\u8bba\u5386\u53f2",
  "Checking discussions": "\u6b63\u5728\u68c0\u67e5\u8ba8\u8bba",
  "Web is checking for existing discussion rooms.":
    "Web \u6b63\u5728\u68c0\u67e5\u5df2\u6709\u8ba8\u8bba\u5ba4\u3002",
  "Discussion history unavailable": "\u8ba8\u8bba\u5386\u53f2\u4e0d\u53ef\u7528",
  "Existing discussions could not be loaded.": "\u65e0\u6cd5\u52a0\u8f7d\u5df2\u6709\u8ba8\u8bba\u3002",
  "1 existing discussion": "1 \u4e2a\u5df2\u6709\u8ba8\u8bba",
  "{count} existing discussions": "{count} \u4e2a\u5df2\u6709\u8ba8\u8bba",
  "You can continue a previous discussion room.":
    "\u4f60\u53ef\u4ee5\u7ee7\u7eed\u4e4b\u524d\u7684\u8ba8\u8bba\u5ba4\u3002",
  "Start a discussion to create the first room.":
    "\u5f00\u59cb\u4e00\u4e2a\u8ba8\u8bba\u4ee5\u521b\u5efa\u7b2c\u4e00\u4e2a\u8ba8\u8bba\u5ba4\u3002",
  "Recommended next step": "\u5efa\u8bae\u7684\u4e0b\u4e00\u6b65",
  "Use configured model participants for the next discussion.":
    "\u4e0b\u4e00\u6b21\u8ba8\u8bba\u5c06\u4f7f\u7528\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Start demo discussion": "\u5f00\u59cb\u6f14\u793a\u8ba8\u8bba",
  "Try the full discussion path with built-in participants while you finish model setup.":
    "\u5728\u5b8c\u6210\u6a21\u578b\u8bbe\u7f6e\u524d\uff0c\u5148\u7528\u5185\u7f6e\u53c2\u4e0e\u8005\u8bd5\u7528\u5b8c\u6574\u8ba8\u8bba\u8def\u5f84\u3002",
  "Review a discussion that already exists while setup is being checked.":
    "\u5728\u68c0\u67e5\u8bbe\u7f6e\u65f6\uff0c\u53ef\u4ee5\u5148\u5ba1\u9605\u5df2\u6709\u8ba8\u8bba\u3002",
  "Finish model setup": "\u5b8c\u6210\u6a21\u578b\u8bbe\u7f6e",
  "Add model provider details before relying on real model-backed discussions.":
    "\u4f9d\u8d56\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u6dfb\u52a0\u6a21\u578b\u63d0\u4f9b\u65b9\u8be6\u60c5\u3002",
  "Model setup status": "\u6a21\u578b\u8bbe\u7f6e\u72b6\u6001",
  "See daemon connection, local demo readiness, provider readiness, and the safest next setup action in user language.":
    "\u7528\u7528\u6237\u80fd\u7406\u89e3\u7684\u8bed\u8a00\u67e5\u770b\u5b88\u62a4\u8fdb\u7a0b\u8fde\u63a5\u3001\u672c\u5730\u6f14\u793a\u5c31\u7eea\u72b6\u6001\u3001\u63d0\u4f9b\u65b9\u5c31\u7eea\u72b6\u6001\u548c\u6700\u5b89\u5168\u7684\u4e0b\u4e00\u6b65\u8bbe\u7f6e\u64cd\u4f5c\u3002",
  "See local service connection, local demo readiness, provider readiness, and the safest next setup action in user language.":
    "\u7528\u7528\u6237\u80fd\u7406\u89e3\u7684\u8bed\u8a00\u67e5\u770b\u672c\u5730\u670d\u52a1\u8fde\u63a5\u3001\u672c\u5730\u6f14\u793a\u5c31\u7eea\u72b6\u6001\u3001\u63d0\u4f9b\u65b9\u5c31\u7eea\u72b6\u6001\u548c\u6700\u5b89\u5168\u7684\u4e0b\u4e00\u6b65\u8bbe\u7f6e\u64cd\u4f5c\u3002",
  "Check whether the local system can run model-backed discussions, and see the safest next setup action without exposing secrets.":
    "\u68c0\u67e5\u672c\u5730\u7cfb\u7edf\u662f\u5426\u53ef\u4ee5\u8fd0\u884c\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\uff0c\u5e76\u5728\u4e0d\u66b4\u9732\u5bc6\u94a5\u7684\u60c5\u51b5\u4e0b\u67e5\u770b\u6700\u5b89\u5168\u7684\u4e0b\u4e00\u6b65\u8bbe\u7f6e\u64cd\u4f5c\u3002",
  "Checking model setup": "\u6b63\u5728\u68c0\u67e5\u6a21\u578b\u8bbe\u7f6e",
  "Could not load model setup": "\u65e0\u6cd5\u52a0\u8f7d\u6a21\u578b\u8bbe\u7f6e",
  "Local service setup": "\u672c\u5730\u670d\u52a1\u8bbe\u7f6e",
  "Start the local service": "\u542f\u52a8\u672c\u5730\u670d\u52a1",
  "Web cannot read setup or discussions until the local Deliberum service is running.":
    "\u672c\u5730 Deliberum \u670d\u52a1\u8fd0\u884c\u4e4b\u524d\uff0cWeb \u65e0\u6cd5\u8bfb\u53d6\u8bbe\u7f6e\u6216\u8ba8\u8bba\u3002",
  "Open Setup / Models for the local start command and model setup steps.":
    "\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b\u67e5\u770b\u672c\u5730\u542f\u52a8\u547d\u4ee4\u548c\u6a21\u578b\u8bbe\u7f6e\u6b65\u9aa4\u3002",
  "1. Start local service": "1. \u542f\u52a8\u672c\u5730\u670d\u52a1",
  "Run this command from the repository on this machine.":
    "\u5728\u8fd9\u53f0\u673a\u5668\u4e0a\u4ece\u4ed3\u5e93\u76ee\u5f55\u8fd0\u884c\u6b64\u547d\u4ee4\u3002",
  "Local service command": "\u672c\u5730\u670d\u52a1\u547d\u4ee4",
  "This starts the local Web and service; model API keys are added from Web after it connects.":
    "\u8fd9\u4f1a\u542f\u52a8\u672c\u5730 Web \u548c\u672c\u5730\u670d\u52a1\uff1b\u8fde\u63a5\u540e\u518d\u4ece Web \u6dfb\u52a0\u6a21\u578b API key\u3002",
  "2. Return to Web": "2. \u8fd4\u56de Web",
  "Keep this page open, then use Check again after the service starts.":
    "\u4fdd\u6301\u6b64\u9875\u6253\u5f00\uff0c\u670d\u52a1\u542f\u52a8\u540e\u4f7f\u7528\u201c\u518d\u6b21\u68c0\u67e5\u201d\u3002",
  "3. Configure models in Web": "3. \u5728 Web \u4e2d\u914d\u7f6e\u6a21\u578b",
  "After the service responds, open Setup / Models to add the provider API key, base URL, and model.":
    "\u670d\u52a1\u54cd\u5e94\u540e\uff0c\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b\u6dfb\u52a0\u63d0\u4f9b\u65b9 API key\u3001base URL \u548c\u6a21\u578b\u3002",
  "Check again": "\u518d\u6b21\u68c0\u67e5",
  "Advanced details keep diagnostics and low-level connection values out of the default setup path.":
    "\u9ad8\u7ea7\u8be6\u60c5\u4f1a\u5c06\u8bca\u65ad\u4fe1\u606f\u548c\u5e95\u5c42\u8fde\u63a5\u503c\u653e\u5728\u9ed8\u8ba4\u8bbe\u7f6e\u8def\u5f84\u4e4b\u5916\u3002",
  "No model setup returned": "\u6ca1\u6709\u8fd4\u56de\u6a21\u578b\u8bbe\u7f6e",
  "The daemon did not return safe model setup status.":
    "\u5b88\u62a4\u8fdb\u7a0b\u6ca1\u6709\u8fd4\u56de\u5b89\u5168\u7684\u6a21\u578b\u8bbe\u7f6e\u72b6\u6001\u3002",
  "The local service did not return safe model setup status.":
    "\u672c\u5730\u670d\u52a1\u6ca1\u6709\u8fd4\u56de\u5b89\u5168\u7684\u6a21\u578b\u8bbe\u7f6e\u72b6\u6001\u3002",
  "Model providers": "\u6a21\u578b\u63d0\u4f9b\u65b9",
  "Safest next action": "\u6700\u5b89\u5168\u7684\u4e0b\u4e00\u6b65",
  "How Web setup works locally": "Web \u672c\u5730\u8bbe\u7f6e\u7684\u5de5\u4f5c\u65b9\u5f0f",
  "Web saves provider setup to the local daemon configuration file and applies it to the current daemon when possible.":
    "Web \u4f1a\u628a\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u4fdd\u5b58\u5230\u672c\u5730\u5b88\u62a4\u8fdb\u7a0b\u914d\u7f6e\u6587\u4ef6\uff0c\u5e76\u5728\u53ef\u884c\u65f6\u7acb\u5373\u5e94\u7528\u5230\u5f53\u524d\u5b88\u62a4\u8fdb\u7a0b\u3002",
  "Web saves provider setup to the local service configuration and applies it to the current local service when possible.":
    "Web \u4f1a\u628a\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u4fdd\u5b58\u5230\u672c\u5730\u670d\u52a1\u914d\u7f6e\uff0c\u5e76\u5728\u53ef\u884c\u65f6\u7acb\u5373\u5e94\u7528\u5230\u5f53\u524d\u672c\u5730\u670d\u52a1\u3002",
  "Add model": "\u6dfb\u52a0\u6a21\u578b",
  "Configure OpenAI-compatible provider": "\u914d\u7f6e OpenAI-compatible \u63d0\u4f9b\u65b9",
  "Save the provider API key, base URL, and model to this machine so future discussions can use real model participants.":
    "\u5c06\u63d0\u4f9b\u65b9 API key\u3001base URL \u548c model \u4fdd\u5b58\u5230\u8fd9\u53f0\u673a\u5668\uff0c\u8ba9\u540e\u7eed\u8ba8\u8bba\u53ef\u4ee5\u4f7f\u7528\u771f\u5b9e\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Structured review compatibility": "\u7ed3\u6784\u5316\u5ba1\u8bae\u517c\u5bb9\u6027",
  "Recommended for real providers so Deliberum can organize options, disagreements, evidence gaps, risks, conclusions, and next actions more reliably.":
    "\u5efa\u8bae\u771f\u5b9e\u63d0\u4f9b\u65b9\u542f\u7528\uff0c\u8ba9 Deliberum \u66f4\u7a33\u5b9a\u5730\u6574\u7406\u9009\u9879\u3001\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u3001\u98ce\u9669\u3001\u7ed3\u8bba\u548c\u4e0b\u4e00\u6b65\u3002",
  "Model management": "\u6a21\u578b\u7ba1\u7406",
  "Current model setup": "\u5f53\u524d\u6a21\u578b\u8bbe\u7f6e",
  "Ready and verified": "\u5df2\u5c31\u7eea\u4e14\u5df2\u9a8c\u8bc1",
  "The provider is ready and the latest Web test request succeeded.":
    "\u63d0\u4f9b\u65b9\u5df2\u5c31\u7eea\uff0c\u6700\u8fd1\u4e00\u6b21 Web \u6d4b\u8bd5\u8bf7\u6c42\u5df2\u6210\u529f\u3002",
  "Ready for real discussions": "\u53ef\u7528\u4e8e\u771f\u5b9e\u8ba8\u8bba",
  "Web can start model-backed discussions with this provider. Verify the connection when you want a fresh test.":
    "Web \u53ef\u4ee5\u4f7f\u7528\u6b64\u63d0\u4f9b\u65b9\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002\u9700\u8981\u91cd\u65b0\u6d4b\u8bd5\u65f6\uff0c\u8bf7\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Verify before real discussions": "\u5f00\u59cb\u771f\u5b9e\u8ba8\u8bba\u524d\u8bf7\u5148\u9a8c\u8bc1",
  "The provider setup is saved locally. Verify the connection before starting model-backed discussions.":
    "\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u5df2\u4fdd\u5b58\u5230\u672c\u5730\u3002\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Saved in this session": "\u5df2\u5728\u5f53\u524d\u4f1a\u8bdd\u4fdd\u5b58",
  "The local service accepted this setup. Verify the connection before relying on it for a discussion.":
    "\u672c\u5730\u670d\u52a1\u5df2\u63a5\u53d7\u6b64\u8bbe\u7f6e\u3002\u4f9d\u8d56\u5b83\u8fdb\u884c\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Finish setup in Web": "\u5728 Web \u4e2d\u5b8c\u6210\u8bbe\u7f6e",
  "Add or replace the API key, base URL, and model below. Saved secrets stay on this machine and are not displayed again.":
    "\u5728\u4e0b\u65b9\u6dfb\u52a0\u6216\u66ff\u6362 API key\u3001Base URL \u548c\u6a21\u578b\u3002\u5df2\u4fdd\u5b58\u7684\u5bc6\u94a5\u4f1a\u4fdd\u7559\u5728\u672c\u673a\uff0c\u5e76\u4e14\u4e0d\u4f1a\u518d\u6b21\u663e\u793a\u3002",
  "Web shows only readiness here. It never displays saved API keys, base URLs, or exact model values in the default view.":
    "\u8fd9\u91cc\u4ec5\u663e\u793a\u5c31\u7eea\u72b6\u6001\u3002\u9ed8\u8ba4\u89c6\u56fe\u4e0d\u4f1a\u663e\u793a\u5df2\u4fdd\u5b58\u7684 API key\u3001Base URL \u6216\u5177\u4f53\u6a21\u578b\u503c\u3002",
  "The provider Web can configure for this local system.":
    "Web \u53ef\u4ee5\u4e3a\u6b64\u672c\u5730\u7cfb\u7edf\u914d\u7f6e\u7684\u63d0\u4f9b\u65b9\u3002",
  "Saved locally": "\u672c\u5730\u5df2\u4fdd\u5b58",
  "Saved without showing the value.": "\u5df2\u4fdd\u5b58\uff0c\u4f46\u4e0d\u663e\u793a\u5177\u4f53\u503c\u3002",
  "Enter this in the form below.": "\u8bf7\u5728\u4e0b\u65b9\u8868\u5355\u4e2d\u586b\u5199\u3002",
  Connection: "\u8fde\u63a5",
  Verified: "\u5df2\u9a8c\u8bc1",
  "The latest safe provider test succeeded.":
    "\u6700\u8fd1\u4e00\u6b21\u5b89\u5168\u63d0\u4f9b\u65b9\u6d4b\u8bd5\u5df2\u6210\u529f\u3002",
  "Ready to verify": "\u53ef\u4ee5\u9a8c\u8bc1",
  "Use Verify connection before starting a real discussion.":
    "\u5f00\u59cb\u771f\u5b9e\u8ba8\u8bba\u524d\uff0c\u8bf7\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u3002",
  "Needs saved setup": "\u9700\u8981\u5148\u4fdd\u5b58\u8bbe\u7f6e",
  "Save the required setup before testing the provider.":
    "\u6d4b\u8bd5\u63d0\u4f9b\u65b9\u524d\uff0c\u8bf7\u5148\u4fdd\u5b58\u6240\u9700\u8bbe\u7f6e\u3002",
  "Edit model setup": "\u7f16\u8f91\u6a21\u578b\u8bbe\u7f6e",
  "Provider API key": "\u63d0\u4f9b\u65b9 API key",
  "Paste API key": "\u7c98\u8d34 API key",
  "Saving setup": "\u6b63\u5728\u4fdd\u5b58\u8bbe\u7f6e",
  "Save model setup": "\u4fdd\u5b58\u6a21\u578b\u8bbe\u7f6e",
  "Check readiness": "\u68c0\u67e5\u5c31\u7eea\u72b6\u6001",
  "Verifying connection": "\u6b63\u5728\u9a8c\u8bc1\u8fde\u63a5",
  "Verify connection": "\u9a8c\u8bc1\u8fde\u63a5",
  "This provider is ready for model-backed discussions.":
    "\u6b64\u63d0\u4f9b\u65b9\u5df2\u53ef\u7528\u4e8e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "Provider setup is saved; verify the connection before starting model-backed discussions.":
    "\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u5df2\u4fdd\u5b58\uff1b\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Ready in this session": "\u5f53\u524d\u4f1a\u8bdd\u5df2\u5c31\u7eea",
  "The saved setup is active in the current daemon. Check readiness, verify connection, then start a discussion.":
    "\u5df2\u4fdd\u5b58\u7684\u8bbe\u7f6e\u5df2\u5728\u5f53\u524d\u5b88\u62a4\u8fdb\u7a0b\u4e2d\u751f\u6548\u3002\u8bf7\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\u3001\u9a8c\u8bc1\u8fde\u63a5\uff0c\u7136\u540e\u5f00\u59cb\u8ba8\u8bba\u3002",
  "The saved setup is active in the current local service. Check readiness, verify connection, then start a discussion.":
    "\u5df2\u4fdd\u5b58\u7684\u8bbe\u7f6e\u5df2\u5728\u5f53\u524d\u672c\u5730\u670d\u52a1\u4e2d\u751f\u6548\u3002\u8bf7\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\u3001\u9a8c\u8bc1\u8fde\u63a5\uff0c\u7136\u540e\u5f00\u59cb\u8ba8\u8bba\u3002",
  "Save setup in Web, then check readiness so Web can confirm the provider is active.":
    "\u5728 Web \u4e2d\u4fdd\u5b58\u8bbe\u7f6e\uff0c\u7136\u540e\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\uff0c\u8ba9 Web \u786e\u8ba4\u63d0\u4f9b\u65b9\u5df2\u751f\u6548\u3002",
  "The API key is submitted only to your local daemon. Web clears the key field after saving and never shows the saved value.":
    "API key \u53ea\u4f1a\u63d0\u4ea4\u5230\u4f60\u7684\u672c\u5730\u5b88\u62a4\u8fdb\u7a0b\u3002Web \u4fdd\u5b58\u540e\u4f1a\u6e05\u7a7a\u8be5\u8f93\u5165\u6846\uff0c\u5e76\u4e14\u4e0d\u4f1a\u663e\u793a\u5df2\u4fdd\u5b58\u7684\u503c\u3002",
  "The API key is submitted only to your local service. Web clears the key field after saving and never shows the saved value.":
    "API key \u53ea\u4f1a\u63d0\u4ea4\u5230\u4f60\u7684\u672c\u5730\u670d\u52a1\u3002Web \u4fdd\u5b58\u540e\u4f1a\u6e05\u7a7a\u8be5\u8f93\u5165\u6846\uff0c\u5e76\u4e14\u4e0d\u4f1a\u663e\u793a\u5df2\u4fdd\u5b58\u7684\u503c\u3002",
  "Use Verify connection to send one minimal provider request before starting a model-backed discussion.":
    "\u5728\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u53d1\u9001\u4e00\u6b21\u6700\u5c0f\u63d0\u4f9b\u65b9\u8bf7\u6c42\u3002",
  "Verify connection is available now because the saved setup is active in this daemon.":
    "\u5df2\u4fdd\u5b58\u7684\u8bbe\u7f6e\u5df2\u5728\u6b64\u5b88\u62a4\u8fdb\u7a0b\u4e2d\u751f\u6548\uff0c\u73b0\u5728\u53ef\u4ee5\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Verify connection is available now because the saved setup is active in this local service.":
    "\u5df2\u4fdd\u5b58\u7684\u8bbe\u7f6e\u5df2\u5728\u6b64\u672c\u5730\u670d\u52a1\u4e2d\u751f\u6548\uff0c\u73b0\u5728\u53ef\u4ee5\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Verify connection becomes available after Web confirms this provider is ready.":
    "Web \u786e\u8ba4\u6b64\u63d0\u4f9b\u65b9\u5df2\u5c31\u7eea\u540e\uff0c\u624d\u53ef\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u3002",
  "Model setup saved locally": "\u6a21\u578b\u8bbe\u7f6e\u5df2\u4fdd\u5b58\u5230\u672c\u5730",
  "The current daemon can use this setup now. Check readiness, verify connection, then start a real model-backed discussion.":
    "\u5f53\u524d\u5b88\u62a4\u8fdb\u7a0b\u73b0\u5728\u5df2\u53ef\u4ee5\u4f7f\u7528\u8fd9\u4e2a\u8bbe\u7f6e\u3002\u8bf7\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\u3001\u9a8c\u8bc1\u8fde\u63a5\uff0c\u7136\u540e\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "The current local service can use this setup now. Check readiness, verify connection, then start a real model-backed discussion.":
    "\u5f53\u524d\u672c\u5730\u670d\u52a1\u73b0\u5728\u5df2\u53ef\u4ee5\u4f7f\u7528\u8fd9\u4e2a\u8bbe\u7f6e\u3002\u8bf7\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\u3001\u9a8c\u8bc1\u8fde\u63a5\uff0c\u7136\u540e\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "Restart the local daemon, then return here and check readiness before starting a real model-backed discussion.":
    "\u8bf7\u91cd\u542f\u672c\u5730\u5b88\u62a4\u8fdb\u7a0b\uff0c\u7136\u540e\u56de\u5230\u8fd9\u91cc\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\uff0c\u518d\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "Restart the local service, then return here and check readiness before starting a real model-backed discussion.":
    "\u8bf7\u91cd\u542f\u672c\u5730\u670d\u52a1\uff0c\u7136\u540e\u56de\u5230\u8fd9\u91cc\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\uff0c\u518d\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "Model setup could not be saved": "\u65e0\u6cd5\u4fdd\u5b58\u6a21\u578b\u8bbe\u7f6e",
  "Provider connection verified": "\u63d0\u4f9b\u65b9\u8fde\u63a5\u5df2\u9a8c\u8bc1",
  "The configured provider accepted a safe test request. You can start a real model-backed discussion.":
    "\u5df2\u914d\u7f6e\u7684\u63d0\u4f9b\u65b9\u63a5\u53d7\u4e86\u4e00\u6b21\u5b89\u5168\u6d4b\u8bd5\u8bf7\u6c42\u3002\u73b0\u5728\u53ef\u4ee5\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "Provider verification recovery options": "\u63d0\u4f9b\u65b9\u9a8c\u8bc1\u6062\u590d\u9009\u9879",
  "Keep setup moving": "\u7ee7\u7eed\u63a8\u8fdb\u8bbe\u7f6e",
  "Use these steps when the provider cannot be verified so you can fix setup, retry safely, or continue with a demo discussion.":
    "\u5f53\u63d0\u4f9b\u65b9\u65e0\u6cd5\u9a8c\u8bc1\u65f6\uff0c\u6309\u8fd9\u4e9b\u6b65\u9aa4\u4fee\u6b63\u8bbe\u7f6e\u3001\u5b89\u5168\u91cd\u8bd5\uff0c\u6216\u5148\u7ee7\u7eed\u4f7f\u7528\u6f14\u793a\u8ba8\u8bba\u3002",
  "Review setup fields": "\u68c0\u67e5\u8bbe\u7f6e\u5b57\u6bb5",
  "Check the API key, base URL, and model, then save setup again if anything changed.":
    "\u68c0\u67e5 API key\u3001base URL \u548c model\uff0c\u5982\u679c\u6709\u4efb\u4f55\u4fee\u6539\uff0c\u8bf7\u91cd\u65b0\u4fdd\u5b58\u8bbe\u7f6e\u3002",
  "If the base URL points to a local or private provider, make sure that provider is running before you retry.":
    "\u5982\u679c base URL \u6307\u5411\u672c\u5730\u6216\u79c1\u6709\u63d0\u4f9b\u65b9\uff0c\u91cd\u8bd5\u524d\u8bf7\u786e\u8ba4\u8be5\u63d0\u4f9b\u65b9\u5df2\u542f\u52a8\u3002",
  "Try Verify connection again": "\u518d\u6b21\u5c1d\u8bd5\u9a8c\u8bc1\u8fde\u63a5",
  "Send another minimal test request after setup is corrected.":
    "\u4fee\u6b63\u8bbe\u7f6e\u540e\uff0c\u518d\u53d1\u9001\u4e00\u6b21\u6700\u5c0f\u6d4b\u8bd5\u8bf7\u6c42\u3002",
  "While fixing setup": "\u4fee\u590d\u8bbe\u7f6e\u671f\u95f4",
  "Use built-in participants to learn the full discussion flow without provider calls.":
    "\u4f7f\u7528\u5185\u7f6e\u53c2\u4e0e\u8005\u4e86\u89e3\u5b8c\u6574\u8ba8\u8bba\u6d41\u7a0b\uff0c\u65e0\u9700\u8c03\u7528\u63d0\u4f9b\u65b9\u3002",
  "Setup path": "\u8bbe\u7f6e\u8def\u5f84",
  "Ready to start with real model participants":
    "\u5df2\u53ef\u4f7f\u7528\u771f\u5b9e\u6a21\u578b\u53c2\u4e0e\u8005\u5f00\u59cb",
  "The provider setup is available for new discussions. The start page will select model-backed participants by default while keeping demo participants available.":
    "\u6b64\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u5df2\u53ef\u7528\u4e8e\u65b0\u8ba8\u8bba\u3002\u5f00\u59cb\u9875\u4f1a\u9ed8\u8ba4\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\uff0c\u540c\u65f6\u4fdd\u7559\u6f14\u793a\u53c2\u4e0e\u8005\u53ef\u7528\u3002",
  "Verify the provider before starting": "\u5f00\u59cb\u524d\u8bf7\u5148\u9a8c\u8bc1\u63d0\u4f9b\u65b9",
  "The saved setup is active in this daemon. Verification sends one minimal request so you can catch key, base URL, or model problems before the discussion.":
    "\u5df2\u4fdd\u5b58\u7684\u8bbe\u7f6e\u5df2\u5728\u6b64\u5b88\u62a4\u8fdb\u7a0b\u4e2d\u751f\u6548\u3002\u9a8c\u8bc1\u4f1a\u53d1\u9001\u4e00\u6b21\u6700\u5c0f\u8bf7\u6c42\uff0c\u5e2e\u4f60\u5728\u8ba8\u8bba\u524d\u53d1\u73b0 key\u3001base URL \u6216 model \u95ee\u9898\u3002",
  "The saved setup is active in this local service. Verification sends one minimal request so you can catch key, base URL, or model problems before the discussion.":
    "\u5df2\u4fdd\u5b58\u7684\u8bbe\u7f6e\u5df2\u5728\u6b64\u672c\u5730\u670d\u52a1\u4e2d\u751f\u6548\u3002\u9a8c\u8bc1\u4f1a\u53d1\u9001\u4e00\u6b21\u6700\u5c0f\u8bf7\u6c42\uff0c\u5e2e\u4f60\u5728\u8ba8\u8bba\u524d\u53d1\u73b0 key\u3001base URL \u6216 model \u95ee\u9898\u3002",
  "Provider connection could not be verified": "\u65e0\u6cd5\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u8fde\u63a5",
  "Verify the saved provider connection here to continue with model-backed participants without returning to Setup / Models.":
    "\u5728\u6b64\u9a8c\u8bc1\u5df2\u4fdd\u5b58\u7684\u63d0\u4f9b\u65b9\u8fde\u63a5\uff0c\u5373\u53ef\u7ee7\u7eed\u4f7f\u7528\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\uff0c\u65e0\u9700\u8fd4\u56de\u8bbe\u7f6e / \u6a21\u578b\u3002",
  "Use the Web form above to add the provider API key, base URL, and model on this machine.":
    "\u4f7f\u7528\u4e0a\u65b9 Web \u8868\u5355\u5728\u8fd9\u53f0\u673a\u5668\u4e0a\u6dfb\u52a0\u63d0\u4f9b\u65b9 API key\u3001base URL \u548c model\u3002",
  "Configure provider": "\u914d\u7f6e\u63d0\u4f9b\u65b9",
  "Web writes a local daemon configuration block and does not show the API key again after saving.":
    "Web \u4f1a\u5199\u5165\u672c\u5730\u5b88\u62a4\u8fdb\u7a0b\u914d\u7f6e\u5757\uff0c\u4fdd\u5b58\u540e\u4e0d\u518d\u663e\u793a API key\u3002",
  "Web writes local service configuration and does not show the API key again after saving.":
    "Web \u4f1a\u5199\u5165\u672c\u5730\u670d\u52a1\u914d\u7f6e\uff0c\u4fdd\u5b58\u540e\u4e0d\u518d\u663e\u793a API key\u3002",
  "Test connection": "\u6d4b\u8bd5\u8fde\u63a5",
  "Use Check readiness and Verify connection to confirm model-backed discussions are ready.":
    "\u4f7f\u7528\u201c\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\u201d\u548c\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u786e\u8ba4\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u5df2\u51c6\u5907\u597d\u3002",
  "Ready for discussions": "\u53ef\u7528\u4e8e\u8ba8\u8bba",
  "When a model provider is ready, start a discussion and use configured participants or model-backed discussion plans.":
    "\u5f53\u6a21\u578b\u63d0\u4f9b\u65b9\u5c31\u7eea\u540e\uff0c\u5f00\u59cb\u8ba8\u8bba\u5e76\u4f7f\u7528\u5df2\u914d\u7f6e\u7684\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u8ba1\u5212\u3002",
  "Open Advanced / Developer Mode for exact environment variable names, setup-plan metadata, and diagnostic commands.":
    "\u6253\u5f00\u9ad8\u7ea7 / \u5f00\u53d1\u8005\u6a21\u5f0f\u67e5\u770b\u786e\u5207\u73af\u5883\u53d8\u91cf\u540d\u79f0\u3001\u8bbe\u7f6e\u8ba1\u5212\u5143\u6570\u636e\u548c\u8bca\u65ad\u547d\u4ee4\u3002",
  "Discussion readiness": "\u8ba8\u8bba\u5c31\u7eea\u72b6\u6001",
  "What can run now": "\u73b0\u5728\u53ef\u4ee5\u8fd0\u884c\u4ec0\u4e48",
  "This turns setup status into the discussion path: demo participants, real model participants, review roles, conclusion writing, and the next step.":
    "\u8fd9\u4f1a\u628a\u8bbe\u7f6e\u72b6\u6001\u8f6c\u6210\u8ba8\u8bba\u8def\u5f84\uff1a\u6f14\u793a\u53c2\u4e0e\u8005\u3001\u771f\u5b9e\u6a21\u578b\u53c2\u4e0e\u8005\u3001\u5ba1\u67e5\u89d2\u8272\u3001\u7ed3\u8bba\u8d77\u8349\u548c\u4e0b\u4e00\u6b65\u3002",
  "Participant management": "\u53c2\u4e0e\u8005\u7ba1\u7406",
  "Discussion participants": "\u8ba8\u8bba\u53c2\u4e0e\u8005",
  "This shows which readable roles are ready before you start: first perspectives, reviewers, evidence checks, and conclusion writing.":
    "\u8fd9\u4f1a\u5728\u5f00\u59cb\u524d\u663e\u793a\u54ea\u4e9b\u53ef\u7406\u89e3\u89d2\u8272\u5df2\u5c31\u7eea\uff1a\u521d\u59cb\u89c6\u89d2\u3001\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u548c\u7ed3\u8bba\u8d77\u8349\u3002",
  "Model assignment": "\u6a21\u578b\u5206\u914d",
  "Single verified provider": "\u5355\u4e2a\u5df2\u9a8c\u8bc1\u63d0\u4f9b\u65b9",
  "Verify provider first": "\u5148\u9a8c\u8bc1\u63d0\u4f9b\u65b9",
  "Demo roles only": "\u4ec5\u6f14\u793a\u89d2\u8272",
  "No model roles ready": "\u5c1a\u65e0\u6a21\u578b\u89d2\u8272\u5c31\u7eea",
  "Perspective A, Perspective B, optional Perspective C, Reviewer, Evidence checker, Risk reviewer, and Conclusion writer use {provider} in the current Web path.":
    "\u5728\u5f53\u524d Web \u8def\u5f84\u4e2d\uff0c\u89c6\u89d2 A\u3001\u89c6\u89d2 B\u3001\u53ef\u9009\u7684\u89c6\u89d2 C\u3001\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u3001\u98ce\u9669\u5ba1\u67e5\u8005\u548c\u7ed3\u8bba\u8d77\u8349\u8005\u4f7f\u7528 {provider}\u3002",
  "The saved provider cannot power model participants until Verify connection succeeds.":
    "\u5728\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u6210\u529f\u4e4b\u524d\uff0c\u5df2\u4fdd\u5b58\u7684\u63d0\u4f9b\u65b9\u8fd8\u4e0d\u80fd\u9a71\u52a8\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Demo discussions use built-in material. Add and verify a provider before model-backed roles are available.":
    "\u6f14\u793a\u8ba8\u8bba\u4f7f\u7528\u5185\u7f6e\u6750\u6599\u3002\u6a21\u578b\u652f\u6301\u7684\u89d2\u8272\u53ef\u7528\u524d\uff0c\u8bf7\u5148\u6dfb\u52a0\u5e76\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u3002",
  "Choose Focused review or Broader review on the start page before creating the discussion.":
    "\u521b\u5efa\u8ba8\u8bba\u524d\uff0c\u8bf7\u5728\u5f00\u59cb\u9875\u9009\u62e9\u201c\u805a\u7126\u5ba1\u67e5\u201d\u6216\u201c\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5\u201d\u3002",
  "After verification, open the start page to choose Focused review or Broader review.":
    "\u9a8c\u8bc1\u540e\uff0c\u6253\u5f00\u5f00\u59cb\u9875\u9009\u62e9\u201c\u805a\u7126\u5ba1\u67e5\u201d\u6216\u201c\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5\u201d\u3002",
  "Start a demo discussion now, or finish model setup to choose focused or broader model-backed review.":
    "\u73b0\u5728\u53ef\u4ee5\u5f00\u59cb\u6f14\u793a\u8ba8\u8bba\uff0c\u6216\u5b8c\u6210\u6a21\u578b\u8bbe\u7f6e\u540e\u9009\u62e9\u805a\u7126\u6216\u66f4\u5e7f\u7684\u6a21\u578b\u652f\u6301\u5ba1\u67e5\u3002",
  "Current limit": "\u5f53\u524d\u9650\u5236",
  "Exact saved provider values stay hidden on this page. Role-specific model assignment is not available in the default Web path yet.":
    "\u7cbe\u786e\u7684\u5df2\u4fdd\u5b58\u63d0\u4f9b\u65b9\u503c\u4f1a\u5728\u6b64\u9875\u9762\u4fdd\u6301\u9690\u85cf\u3002\u9ed8\u8ba4 Web \u8def\u5f84\u5c1a\u4e0d\u652f\u6301\u6309\u89d2\u8272\u5206\u914d\u6a21\u578b\u3002",
  "Participant plan": "\u53c2\u4e0e\u8005\u8ba1\u5212",
  "Who joins the discussion": "\u8c01\u4f1a\u52a0\u5165\u8ba8\u8bba",
  "This maps the current setup to the roles a normal user will see in the discussion room.":
    "\u8fd9\u4f1a\u628a\u5f53\u524d\u8bbe\u7f6e\u5bf9\u5e94\u5230\u666e\u901a\u7528\u6237\u5728\u8ba8\u8bba\u5ba4\u4e2d\u4f1a\u770b\u5230\u7684\u89d2\u8272\u3002",
  Uses: "\u4f7f\u7528",
  "First responses": "\u521d\u59cb\u56de\u5e94",
  "Model-backed": "\u6a21\u578b\u652f\u6301",
  "Needs setup": "\u9700\u8981\u8bbe\u7f6e",
  "Perspective A and Perspective B use {provider}.":
    "\u89c6\u89d2 A \u548c\u89c6\u89d2 B \u4f7f\u7528 {provider}\u3002",
  "Perspective A and Perspective B can use the saved provider after verification.":
    "\u9a8c\u8bc1\u540e\uff0c\u89c6\u89d2 A \u548c\u89c6\u89d2 B \u53ef\u4ee5\u4f7f\u7528\u5df2\u4fdd\u5b58\u7684\u63d0\u4f9b\u65b9\u3002",
  "Perspective A and Perspective B use built-in demo material.":
    "\u89c6\u89d2 A \u548c\u89c6\u89d2 B \u4f7f\u7528\u5185\u7f6e\u6f14\u793a\u6750\u6599\u3002",
  "No first-response participants are ready yet.":
    "\u521d\u59cb\u56de\u5e94\u53c2\u4e0e\u8005\u5c1a\u672a\u5c31\u7eea\u3002",
  "These independent first responses become the main perspectives users compare in the room.":
    "\u8fd9\u4e9b\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u4f1a\u6210\u4e3a\u7528\u6237\u5728\u8ba8\u8bba\u5ba4\u4e2d\u6bd4\u8f83\u7684\u4e3b\u8981\u89c6\u89d2\u3002",
  "Start discussion will use model participants by default.":
    "\u5f00\u59cb\u8ba8\u8bba\u5c06\u9ed8\u8ba4\u4f7f\u7528\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Verify connection before starting with model participants.":
    "\u4f7f\u7528\u6a21\u578b\u53c2\u4e0e\u8005\u5f00\u59cb\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Use the demo now or add a provider for real model responses.":
    "\u73b0\u5728\u53ef\u4ee5\u4f7f\u7528\u6f14\u793a\uff0c\u6216\u6dfb\u52a0\u63d0\u4f9b\u65b9\u4ee5\u83b7\u5f97\u771f\u5b9e\u6a21\u578b\u56de\u5e94\u3002",
  "Add a model provider before starting.":
    "\u5f00\u59cb\u524d\u8bf7\u5148\u6dfb\u52a0\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "Third perspective available": "\u7b2c\u4e09\u4e2a\u89c6\u89d2\u53ef\u7528",
  "Provider required": "\u9700\u8981\u63d0\u4f9b\u65b9",
  "Perspective C can use {provider}.": "\u89c6\u89d2 C \u53ef\u4ee5\u4f7f\u7528 {provider}\u3002",
  "Perspective C can use the saved provider after verification.":
    "\u9a8c\u8bc1\u540e\uff0c\u89c6\u89d2 C \u53ef\u4ee5\u4f7f\u7528\u5df2\u4fdd\u5b58\u7684\u63d0\u4f9b\u65b9\u3002",
  "Perspective C is not available until a model provider is ready.":
    "\u5728\u6a21\u578b\u63d0\u4f9b\u65b9\u5c31\u7eea\u4e4b\u524d\uff0c\u89c6\u89d2 C \u4e0d\u53ef\u7528\u3002",
  "Broader review adds one more independent model response when the question needs more comparison material.":
    "\u5f53\u95ee\u9898\u9700\u8981\u66f4\u591a\u6bd4\u8f83\u6750\u6599\u65f6\uff0c\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5\u4f1a\u589e\u52a0\u4e00\u4e2a\u72ec\u7acb\u6a21\u578b\u56de\u5e94\u3002",
  "Choose Broader review on the start page to include Perspective C.":
    "\u5728\u5f00\u59cb\u9875\u9009\u62e9\u201c\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5\u201d\u4ee5\u5305\u542b\u89c6\u89d2 C\u3002",
  "Add a provider to unlock Perspective C and real model-backed broader review.":
    "\u6dfb\u52a0\u63d0\u4f9b\u65b9\u5373\u53ef\u89e3\u9501\u89c6\u89d2 C \u548c\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5\u3002",
  "Verify connection to unlock Perspective C and real model-backed broader review.":
    "\u9a8c\u8bc1\u8fde\u63a5\u540e\uff0c\u5373\u53ef\u89e3\u9501\u89c6\u89d2 C \u548c\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5\u3002",
  "Disagreement and evidence review": "\u5206\u6b67\u4e0e\u8bc1\u636e\u5ba1\u67e5",
  "Reviewer, Evidence checker, and Risk reviewer use the local review flow.":
    "\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u548c\u98ce\u9669\u5ba1\u67e5\u8005\u4f7f\u7528\u672c\u5730\u5ba1\u67e5\u6d41\u7a0b\u3002",
  "Reviewer, Evidence checker, and Risk reviewer use the configured model provider.":
    "\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u548c\u98ce\u9669\u5ba1\u67e5\u8005\u4f7f\u7528\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "Reviewer, Evidence checker, and Risk reviewer are not ready yet.":
    "\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u548c\u98ce\u9669\u5ba1\u67e5\u8005\u5c1a\u672a\u5c31\u7eea\u3002",
  "These roles keep open disagreements, missing evidence, and risks visible before the conclusion is trusted.":
    "\u8fd9\u4e9b\u89d2\u8272\u4f1a\u5728\u7ed3\u8bba\u88ab\u4fe1\u4efb\u4e4b\u524d\uff0c\u6301\u7eed\u663e\u793a\u672a\u89e3\u5206\u6b67\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u98ce\u9669\u3002",
  "Start the room and continue review when the first responses are ready.":
    "\u542f\u52a8\u8ba8\u8bba\u5ba4\uff0c\u5e76\u5728\u521d\u59cb\u56de\u5e94\u5c31\u7eea\u540e\u7ee7\u7eed\u5ba1\u67e5\u3002",
  "Finish review role setup before relying on review steps.":
    "\u4f9d\u8d56\u5ba1\u67e5\u6b65\u9aa4\u524d\uff0c\u8bf7\u5148\u5b8c\u6210\u5ba1\u67e5\u89d2\u8272\u8bbe\u7f6e\u3002",
  "Conclusion and next actions": "\u7ed3\u8bba\u4e0e\u4e0b\u4e00\u6b65",
  "Conclusion writer ready": "\u7ed3\u8bba\u8d77\u8349\u8005\u5df2\u5c31\u7eea",
  "Conclusion writer setup needed": "\u9700\u8981\u8bbe\u7f6e\u7ed3\u8bba\u8d77\u8349\u8005",
  "Conclusion writer uses the local review flow.":
    "\u7ed3\u8bba\u8d77\u8349\u8005\u4f7f\u7528\u672c\u5730\u5ba1\u67e5\u6d41\u7a0b\u3002",
  "Conclusion writer uses the configured model provider.":
    "\u7ed3\u8bba\u8d77\u8349\u8005\u4f7f\u7528\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "Conclusion writer is not ready yet.": "\u7ed3\u8bba\u8d77\u8349\u8005\u5c1a\u672a\u5c31\u7eea\u3002",
  "This role turns the current discussion state into a reviewable conclusion with recommended next actions.":
    "\u8be5\u89d2\u8272\u4f1a\u5c06\u5f53\u524d\u8ba8\u8bba\u72b6\u6001\u8f6c\u6210\u5e26\u5efa\u8bae\u4e0b\u4e00\u6b65\u7684\u53ef\u5ba1\u9605\u7ed3\u8bba\u3002",
  "Review the conclusion panel after the room has enough discussion material.":
    "\u8ba8\u8bba\u5ba4\u79ef\u7d2f\u8db3\u591f\u8ba8\u8bba\u6750\u6599\u540e\uff0c\u5ba1\u9605\u7ed3\u8bba\u9762\u677f\u3002",
  "Finish review role setup before relying on generated conclusions.":
    "\u4f9d\u8d56\u751f\u6210\u7684\u7ed3\u8bba\u524d\uff0c\u8bf7\u5148\u5b8c\u6210\u5ba1\u67e5\u89d2\u8272\u8bbe\u7f6e\u3002",
  "Model ready": "\u6a21\u578b\u5df2\u5c31\u7eea",
  "Demo ready": "\u6f14\u793a\u5df2\u5c31\u7eea",
  "Saved model provider": "\u5df2\u4fdd\u5b58\u7684\u6a21\u578b\u63d0\u4f9b\u65b9",
  "Verify provider": "\u9a8c\u8bc1\u63d0\u4f9b\u65b9",
  "Organizer ready": "\u7ec4\u7ec7\u5668\u5df2\u5c31\u7eea",
  "Available in broader review": "\u53ef\u7528\u4e8e\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5",
  "{provider} model": "{provider} \u6a21\u578b",
  "Built-in demo participant": "\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005",
  "No participant source ready": "\u5c1a\u65e0\u5c31\u7eea\u7684\u53c2\u4e0e\u8005\u6765\u6e90",
  "Broader review after model setup": "\u5b8c\u6210\u6a21\u578b\u8bbe\u7f6e\u540e\u53ef\u7528\u4e8e\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5",
  "Review roles ready": "\u5ba1\u67e5\u89d2\u8272\u5df2\u5c31\u7eea",
  "Review roles setup needed": "\u9700\u8981\u8bbe\u7f6e\u5ba1\u67e5\u89d2\u8272",
  "Model review roles": "\u6a21\u578b\u5ba1\u67e5\u89d2\u8272",
  "Local review roles": "\u672c\u5730\u5ba1\u67e5\u89d2\u8272",
  "Review roles not ready": "\u5ba1\u67e5\u89d2\u8272\u5c1a\u672a\u5c31\u7eea",
  "New model-backed discussions can use this provider for independent first responses.":
    "\u65b0\u7684\u6a21\u578b\u652f\u6301\u8ba8\u8bba\u53ef\u4ee5\u4f7f\u7528\u6b64\u63d0\u4f9b\u65b9\u4ea7\u751f\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002",
  "Verify the saved provider connection before using real model perspectives.":
    "\u4f7f\u7528\u771f\u5b9e\u6a21\u578b\u89c6\u89d2\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u5df2\u4fdd\u5b58\u7684\u63d0\u4f9b\u65b9\u8fde\u63a5\u3002",
  "Demo discussions can show the role, but real model perspectives still need provider setup.":
    "\u6f14\u793a\u8ba8\u8bba\u53ef\u4ee5\u5c55\u793a\u8be5\u89d2\u8272\uff0c\u4f46\u771f\u5b9e\u6a21\u578b\u89c6\u89d2\u4ecd\u9700\u8981\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u3002",
  "Add a model provider or local preset before starting a useful discussion.":
    "\u5f00\u59cb\u6709\u7528\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u6dfb\u52a0\u6a21\u578b\u63d0\u4f9b\u65b9\u6216\u672c\u5730\u9884\u8bbe\u3002",
  "Choose Broader review on the start page to add a third independent model perspective.":
    "\u5728\u5f00\u59cb\u9875\u9009\u62e9\u201c\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5\u201d\u5373\u53ef\u6dfb\u52a0\u7b2c\u4e09\u4e2a\u72ec\u7acb\u6a21\u578b\u89c6\u89d2\u3002",
  "Perspective C is only available for model-backed broader review.":
    "\u89c6\u89d2 C \u4ec5\u5728\u6a21\u578b\u652f\u6301\u7684\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5\u4e2d\u53ef\u7528\u3002",
  "Local review roles can compare options, review evidence and risks, and draft the current conclusion.":
    "\u672c\u5730\u5ba1\u67e5\u89d2\u8272\u53ef\u4ee5\u6bd4\u8f83\u9009\u9879\u3001\u5ba1\u67e5\u8bc1\u636e\u548c\u98ce\u9669\uff0c\u5e76\u8d77\u8349\u5f53\u524d\u7ed3\u8bba\u3002",
  "Demo walkthrough": "\u6f14\u793a\u6d41\u7a0b",
  "Built-in demo participants can run a deterministic walkthrough immediately.":
    "\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005\u53ef\u4ee5\u7acb\u5373\u8fd0\u884c\u786e\u5b9a\u6027\u7684\u6f14\u793a\u6d41\u7a0b\u3002",
  "Start the local preset or configure a real provider before trying the discussion flow.":
    "\u8bf7\u5148\u542f\u52a8\u672c\u5730\u9884\u8bbe\u6216\u914d\u7f6e\u771f\u5b9e\u63d0\u4f9b\u65b9\uff0c\u518d\u8bd5\u7528\u8ba8\u8bba\u6d41\u7a0b\u3002",
  "Model participants": "\u6a21\u578b\u53c2\u4e0e\u8005",
  "Configured model participants can answer as independent perspectives.":
    "\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u53ef\u4ee5\u4f5c\u4e3a\u72ec\u7acb\u89c6\u89d2\u8fdb\u884c\u56de\u7b54\u3002",
  "A model provider is saved locally. Verify the connection before relying on real model participants.":
    "\u6a21\u578b\u63d0\u4f9b\u65b9\u5df2\u4fdd\u5b58\u5230\u672c\u5730\u3002\u4f9d\u8d56\u771f\u5b9e\u6a21\u578b\u53c2\u4e0e\u8005\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Save the provider API key, base URL, and model in Web setup, check readiness, then verify the connection.":
    "\u5728 Web \u8bbe\u7f6e\u4e2d\u4fdd\u5b58\u63d0\u4f9b\u65b9 API key\u3001base URL \u548c\u6a21\u578b\uff0c\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\uff0c\u7136\u540e\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "No provider reported": "\u672a\u62a5\u544a\u63d0\u4f9b\u65b9",
  "The daemon did not report a Web-configurable model provider.":
    "\u5b88\u62a4\u8fdb\u7a0b\u6ca1\u6709\u62a5\u544a\u53ef\u901a\u8fc7 Web \u914d\u7f6e\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "The local service did not report a Web-configurable model provider.":
    "\u672c\u5730\u670d\u52a1\u6ca1\u6709\u62a5\u544a\u53ef\u901a\u8fc7 Web \u914d\u7f6e\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "Review roles and conclusion": "\u5ba1\u67e5\u89d2\u8272\u4e0e\u7ed3\u8bba",
  "Local review roles can compare options, review disagreements, evidence, and risks, then draft the current conclusion.":
    "\u672c\u5730\u5ba1\u67e5\u89d2\u8272\u53ef\u4ee5\u6bd4\u8f83\u9009\u9879\u3001\u5ba1\u67e5\u5206\u6b67\u3001\u8bc1\u636e\u548c\u98ce\u9669\uff0c\u7136\u540e\u8d77\u8349\u5f53\u524d\u7ed3\u8bba\u3002",
  "Reviewer, Evidence checker, Risk reviewer, and Conclusion writer can review the discussion after first responses.":
    "\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u3001\u98ce\u9669\u5ba1\u67e5\u8005\u548c\u7ed3\u8bba\u8d77\u8349\u8005\u53ef\u4ee5\u5728\u521d\u59cb\u56de\u5e94\u540e\u5ba1\u67e5\u8ba8\u8bba\u3002",
  "Discussions may collect first responses only until review roles are ready.":
    "\u5728\u5ba1\u67e5\u89d2\u8272\u5c31\u7eea\u524d\uff0c\u8ba8\u8bba\u53ef\u80fd\u53ea\u80fd\u6536\u96c6\u521d\u59cb\u56de\u5e94\u3002",
  "Start model-backed discussion": "\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba",
  "Model-backed start options": "\u6a21\u578b\u652f\u6301\u7684\u5f00\u59cb\u9009\u9879",
  "Start focused discussion": "\u5f00\u59cb\u805a\u7126\u8ba8\u8bba",
  "Start broader discussion": "\u5f00\u59cb\u66f4\u5e7f\u8ba8\u8bba",
  "Role assignment controls": "\u89d2\u8272\u5206\u914d\u63a7\u4ef6",
  "Shared provider setup": "\u5171\u4eab\u63d0\u4f9b\u65b9\u8bbe\u7f6e",
  "One provider for all model roles": "\u4e00\u4e2a\u63d0\u4f9b\u65b9\u7528\u4e8e\u6240\u6709\u6a21\u578b\u89d2\u8272",
  "A change here applies to Perspective A, Perspective B, optional Perspective C, Reviewer, Evidence checker, Risk reviewer, and Conclusion writer.":
    "\u8fd9\u91cc\u7684\u4fee\u6539\u4f1a\u5e94\u7528\u5230\u89c6\u89d2 A\u3001\u89c6\u89d2 B\u3001\u53ef\u9009\u89c6\u89d2 C\u3001\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u3001\u98ce\u9669\u5ba1\u67e5\u8005\u548c\u7ed3\u8bba\u8d77\u8349\u8005\u3002",
  "Review the saved provider fields, then verify connection to unlock model participants.":
    "\u5148\u68c0\u67e5\u5df2\u4fdd\u5b58\u7684\u63d0\u4f9b\u65b9\u5b57\u6bb5\uff0c\u7136\u540e\u9a8c\u8bc1\u8fde\u63a5\u4ee5\u89e3\u9501\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Add the provider API key, base URL, and model before model-backed roles are available.":
    "\u6a21\u578b\u652f\u6301\u7684\u89d2\u8272\u53ef\u7528\u524d\uff0c\u8bf7\u5148\u6dfb\u52a0\u63d0\u4f9b\u65b9 API key\u3001base URL \u548c\u6a21\u578b\u3002",
  "Verify the provider before assigning first-response and review role models on the start page.":
    "\u5728\u5f00\u59cb\u9875\u5206\u914d\u521d\u59cb\u56de\u5e94\u548c\u5ba1\u67e5\u89d2\u8272\u6a21\u578b\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u3002",
  "Add and verify a provider before assigning first-response and review role models on the start page.":
    "\u5728\u5f00\u59cb\u9875\u5206\u914d\u521d\u59cb\u56de\u5e94\u548c\u5ba1\u67e5\u89d2\u8272\u6a21\u578b\u524d\uff0c\u8bf7\u5148\u6dfb\u52a0\u5e76\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u3002",
  "The start page can customize first-response perspective models and a separate review role model for one discussion.":
    "\u5f00\u59cb\u9875\u53ef\u4ee5\u4e3a\u5355\u6b21\u8ba8\u8bba\u81ea\u5b9a\u4e49\u521d\u59cb\u56de\u5e94\u89c6\u89d2\u6a21\u578b\uff0c\u4e5f\u53ef\u4ee5\u5355\u72ec\u6307\u5b9a\u5ba1\u67e5\u89d2\u8272\u6a21\u578b\u3002",
  "Edit shared provider setup": "\u7f16\u8f91\u5171\u4eab\u63d0\u4f9b\u65b9\u8bbe\u7f6e",
  "Review provider setup": "\u68c0\u67e5\u63d0\u4f9b\u65b9\u8bbe\u7f6e",
  "Start discussion will select configured model participants by default while keeping demo participants available.":
    "\u5f00\u59cb\u8ba8\u8bba\u4f1a\u9ed8\u8ba4\u9009\u62e9\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\uff0c\u540c\u65f6\u4fdd\u7559\u6f14\u793a\u53c2\u4e0e\u8005\u53ef\u7528\u3002",
  "Verify provider connection": "\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u8fde\u63a5",
  "This provider is saved locally. Use Verify connection before starting model-backed discussions.":
    "\u6b64\u63d0\u4f9b\u65b9\u5df2\u4fdd\u5b58\u5230\u672c\u5730\u3002\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u3002",
  "Use Verify connection in Setup / Models before starting a real model-backed discussion.":
    "\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u5728\u8bbe\u7f6e / \u6a21\u578b\u4e2d\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u3002",
  "Try a demo discussion": "\u8bd5\u7528\u6f14\u793a\u8ba8\u8bba",
  "Use the sample flow now, then finish provider setup before relying on real model-backed perspectives.":
    "\u73b0\u5728\u53ef\u4ee5\u5148\u4f7f\u7528\u793a\u4f8b\u6d41\u7a0b\uff1b\u5728\u4f9d\u8d56\u771f\u5b9e\u6a21\u578b\u89c6\u89d2\u524d\uff0c\u8bf7\u5b8c\u6210\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u3002",
  "Finish setup first": "\u5148\u5b8c\u6210\u8bbe\u7f6e",
  "Add a demo preset or a real model provider before starting a useful discussion.":
    "\u8bf7\u5148\u6dfb\u52a0\u6f14\u793a\u9884\u8bbe\u6216\u771f\u5b9e\u6a21\u578b\u63d0\u4f9b\u65b9\uff0c\u518d\u5f00\u59cb\u6709\u7528\u7684\u8ba8\u8bba\u3002",
  "Add model setup": "\u6dfb\u52a0\u6a21\u578b\u8bbe\u7f6e",
  "Real provider setup": "\u771f\u5b9e\u63d0\u4f9b\u65b9\u8bbe\u7f6e",
  "Provider setup checklist": "\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u68c0\u67e5\u6e05\u5355",
  "This summarizes what Web can safely know from daemon setup status. It never shows API key values or environment variable names.":
    "\u8fd9\u4f1a\u6c47\u603b Web \u53ef\u4ee5\u4ece\u5b88\u62a4\u8fdb\u7a0b\u8bbe\u7f6e\u72b6\u6001\u4e2d\u5b89\u5168\u77e5\u9053\u7684\u5185\u5bb9\u3002\u5b83\u6c38\u8fdc\u4e0d\u663e\u793a API key \u503c\u6216\u73af\u5883\u53d8\u91cf\u540d\u79f0\u3002",
  "This summarizes what Web can safely know from local service setup status. It never shows API key values or environment variable names.":
    "\u8fd9\u4f1a\u6c47\u603b Web \u53ef\u4ee5\u4ece\u672c\u5730\u670d\u52a1\u8bbe\u7f6e\u72b6\u6001\u4e2d\u5b89\u5168\u77e5\u9053\u7684\u5185\u5bb9\u3002\u5b83\u6c38\u8fdc\u4e0d\u663e\u793a API key \u503c\u6216\u73af\u5883\u53d8\u91cf\u540d\u79f0\u3002",
  "Ready for model-backed discussions.": "\u5df2\u53ef\u7528\u4e8e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "Enabled, but base URL, model, or request details still need setup.":
    "\u5df2\u542f\u7528\uff0c\u4f46 base URL\u3001model \u6216\u8bf7\u6c42\u7ec6\u8282\u4ecd\u9700\u8981\u8bbe\u7f6e\u3002",
  "Configuration is missing before this provider can be used.":
    "\u4f7f\u7528\u6b64\u63d0\u4f9b\u65b9\u4e4b\u524d\u8fd8\u9700\u8865\u5145\u914d\u7f6e\u3002",
  "Enable this provider locally before it can be used.":
    "\u8bf7\u5148\u5728\u672c\u5730\u542f\u7528\u6b64\u63d0\u4f9b\u65b9\uff0c\u7136\u540e\u624d\u80fd\u4f7f\u7528\u3002",
  Provider: "\u63d0\u4f9b\u65b9",
  "Enabled locally": "\u672c\u5730\u5df2\u542f\u7528",
  "The daemon reports this provider as available for setup.":
    "\u5b88\u62a4\u8fdb\u7a0b\u62a5\u544a\u6b64\u63d0\u4f9b\u65b9\u53ef\u7528\u4e8e\u8bbe\u7f6e\u3002",
  "The local service reports this provider as available for setup.":
    "\u672c\u5730\u670d\u52a1\u62a5\u544a\u6b64\u63d0\u4f9b\u65b9\u53ef\u7528\u4e8e\u8bbe\u7f6e\u3002",
  "Enable this provider before configuring model details.":
    "\u5148\u542f\u7528\u6b64\u63d0\u4f9b\u65b9\uff0c\u518d\u914d\u7f6e\u6a21\u578b\u7ec6\u8282\u3002",
  "API key": "API key",
  "No API key reported": "\u672a\u62a5\u544a API key",
  "This provider did not report a secret setup field through safe daemon status.":
    "\u6b64\u63d0\u4f9b\u65b9\u6ca1\u6709\u901a\u8fc7\u5b89\u5168\u5b88\u62a4\u8fdb\u7a0b\u72b6\u6001\u62a5\u544a\u5bc6\u94a5\u8bbe\u7f6e\u5b57\u6bb5\u3002",
  "This provider did not report a secret setup field through safe local service status.":
    "\u6b64\u63d0\u4f9b\u65b9\u6ca1\u6709\u901a\u8fc7\u5b89\u5168\u672c\u5730\u670d\u52a1\u72b6\u6001\u62a5\u544a\u5bc6\u94a5\u8bbe\u7f6e\u5b57\u6bb5\u3002",
  "Configured locally": "\u672c\u5730\u5df2\u914d\u7f6e",
  "The daemon reports that a provider secret is present without exposing its value.":
    "\u5b88\u62a4\u8fdb\u7a0b\u62a5\u544a\u63d0\u4f9b\u65b9\u5bc6\u94a5\u5df2\u5b58\u5728\uff0c\u4f46\u4e0d\u66b4\u9732\u5176\u503c\u3002",
  "The local service reports that a provider secret is present without exposing its value.":
    "\u672c\u5730\u670d\u52a1\u62a5\u544a\u63d0\u4f9b\u65b9\u5bc6\u94a5\u5df2\u5b58\u5728\uff0c\u4f46\u4e0d\u66b4\u9732\u5176\u503c\u3002",
  "API key required": "\u9700\u8981 API key",
  "Enter the provider API key in the Web setup form; the saved value is never shown.":
    "\u5728 Web \u8bbe\u7f6e\u8868\u5355\u4e2d\u8f93\u5165\u63d0\u4f9b\u65b9 API key\uff1b\u5df2\u4fdd\u5b58\u7684\u503c\u4e0d\u4f1a\u88ab\u663e\u793a\u3002",
  "Base URL": "Base URL",
  "Not checked yet": "\u5c1a\u672a\u68c0\u67e5",
  "Enable the provider locally before Web can summarize request target readiness.":
    "\u5148\u5728\u672c\u5730\u542f\u7528\u63d0\u4f9b\u65b9\uff0cWeb \u624d\u80fd\u6c47\u603b\u8bf7\u6c42\u76ee\u6807\u5c31\u7eea\u72b6\u6001\u3002",
  "Base URL needed": "\u9700\u8981 Base URL",
  "Add the provider base URL or request target in Web setup, then check readiness.":
    "\u5728 Web \u8bbe\u7f6e\u4e2d\u6dfb\u52a0\u63d0\u4f9b\u65b9 base URL \u6216\u8bf7\u6c42\u76ee\u6807\uff0c\u7136\u540e\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\u3002",
  "The daemon reports that provider request routing is available.":
    "\u5b88\u62a4\u8fdb\u7a0b\u62a5\u544a\u63d0\u4f9b\u65b9\u8bf7\u6c42\u8def\u7531\u5df2\u53ef\u7528\u3002",
  "The local service reports that provider request routing is available.":
    "\u672c\u5730\u670d\u52a1\u62a5\u544a\u63d0\u4f9b\u65b9\u8bf7\u6c42\u8def\u7531\u5df2\u53ef\u7528\u3002",
  Model: "\u6a21\u578b",
  "Enable the provider locally before Web can summarize model readiness.":
    "\u5148\u5728\u672c\u5730\u542f\u7528\u63d0\u4f9b\u65b9\uff0cWeb \u624d\u80fd\u6c47\u603b\u6a21\u578b\u5c31\u7eea\u72b6\u6001\u3002",
  "Model needed": "\u9700\u8981\u6a21\u578b",
  "Add the provider model in Web setup or local setup before relying on model-backed discussions.":
    "\u5728\u4f9d\u8d56\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u901a\u8fc7 Web \u8bbe\u7f6e\u6216\u672c\u5730\u8bbe\u7f6e\u6dfb\u52a0\u63d0\u4f9b\u65b9\u6a21\u578b\u3002",
  "The daemon reports that a model choice is available for this provider.":
    "\u5b88\u62a4\u8fdb\u7a0b\u62a5\u544a\u6b64\u63d0\u4f9b\u65b9\u5df2\u6709\u53ef\u7528\u7684\u6a21\u578b\u9009\u62e9\u3002",
  "The local service reports that a model choice is available for this provider.":
    "\u672c\u5730\u670d\u52a1\u62a5\u544a\u6b64\u63d0\u4f9b\u65b9\u5df2\u6709\u53ef\u7528\u7684\u6a21\u578b\u9009\u62e9\u3002",
  "Ready to test": "\u53ef\u4ee5\u6d4b\u8bd5",
  "Use Verify connection to confirm the provider accepts a minimal request.":
    "\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u786e\u8ba4\u63d0\u4f9b\u65b9\u53ef\u4ee5\u63a5\u53d7\u6700\u5c0f\u8bf7\u6c42\u3002",
  "Verify after setup": "\u8bbe\u7f6e\u540e\u9a8c\u8bc1",
  "After saving setup, check readiness, then verify connection.":
    "\u4fdd\u5b58\u8bbe\u7f6e\u540e\uff0c\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\uff0c\u7136\u540e\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "Enable provider first": "\u5148\u542f\u7528\u63d0\u4f9b\u65b9",
  "Connection verification is available after this provider is enabled locally.":
    "\u6b64\u63d0\u4f9b\u65b9\u5728\u672c\u5730\u542f\u7528\u540e\u624d\u53ef\u8fdb\u884c\u8fde\u63a5\u9a8c\u8bc1\u3002",
  "View setup steps": "\u67e5\u770b\u8bbe\u7f6e\u6b65\u9aa4",
  "Local demo model": "\u672c\u5730\u6f14\u793a\u6a21\u578b",
  "Model provider": "\u6a21\u578b\u63d0\u4f9b\u65b9",
  "Local preset": "\u672c\u5730\u9884\u8bbe",
  "OpenAI-compatible": "OpenAI \u517c\u5bb9",
  "HTTP-template": "HTTP \u6a21\u677f",
  "MCP tool": "MCP \u5de5\u5177",
  "A real model provider is ready for model-backed discussions.":
    "\u771f\u5b9e\u6a21\u578b\u63d0\u4f9b\u65b9\u5df2\u53ef\u7528\u4e8e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "Verify model provider": "\u9a8c\u8bc1\u6a21\u578b\u63d0\u4f9b\u65b9",
  "A model provider is saved locally; verify the connection before starting real model-backed discussions.":
    "\u6a21\u578b\u63d0\u4f9b\u65b9\u5df2\u4fdd\u5b58\u5230\u672c\u5730\uff1b\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "A model provider is saved locally; verify the connection before starting model-backed discussions.":
    "\u6a21\u578b\u63d0\u4f9b\u65b9\u5df2\u4fdd\u5b58\u5230\u672c\u5730\uff1b\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u8fde\u63a5\u3002",
  "A provider is enabled, but model details still need Web setup or per-discussion model settings.":
    "\u63d0\u4f9b\u65b9\u5df2\u542f\u7528\uff0c\u4f46\u6a21\u578b\u7ec6\u8282\u4ecd\u9700\u8981 Web \u8bbe\u7f6e\u6216\u6bcf\u6b21\u8ba8\u8bba\u7684\u6a21\u578b\u8bbe\u7f6e\u3002",
  "The local preset is ready for demos; configure a provider for real model-backed discussions.":
    "\u672c\u5730\u9884\u8bbe\u53ef\u7528\u4e8e\u6f14\u793a\uff1b\u8bf7\u914d\u7f6e\u63d0\u4f9b\u65b9\u4ee5\u8fdb\u884c\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002",
  "No model provider is ready yet.": "\u5c1a\u65e0\u6a21\u578b\u63d0\u4f9b\u65b9\u5c31\u7eea\u3002",
  "Ready for demo discussions": "\u53ef\u7528\u4e8e\u6f14\u793a\u8ba8\u8bba",
  "Uses deterministic local material and does not call external providers.":
    "\u4f7f\u7528\u786e\u5b9a\u6027\u7684\u672c\u5730\u6750\u6599\uff0c\u4e0d\u8c03\u7528\u5916\u90e8\u63d0\u4f9b\u65b9\u3002",
  "Ready for model-backed discussions": "\u53ef\u7528\u4e8e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba",
  "This provider can support configured model-backed participants from the daemon.":
    "\u6b64\u63d0\u4f9b\u65b9\u53ef\u4ee5\u652f\u6301\u5b88\u62a4\u8fdb\u7a0b\u4e2d\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "This provider can support configured model-backed participants from the local service.":
    "\u6b64\u63d0\u4f9b\u65b9\u53ef\u4ee5\u652f\u6301\u672c\u5730\u670d\u52a1\u4e2d\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Provider enabled; add model details": "\u63d0\u4f9b\u65b9\u5df2\u542f\u7528\uff1b\u8bf7\u6dfb\u52a0\u6a21\u578b\u7ec6\u8282",
  "Add a base URL and model in Web setup when supported, or provide equivalent per-discussion model settings.":
    "\u5728\u652f\u6301\u65f6\u901a\u8fc7 Web \u8bbe\u7f6e\u6dfb\u52a0 base URL \u548c model\uff0c\u6216\u63d0\u4f9b\u7b49\u6548\u7684\u6bcf\u6b21\u8ba8\u8bba\u6a21\u578b\u8bbe\u7f6e\u3002",
  "Configuration required": "\u9700\u8981\u914d\u7f6e",
  "Add the missing setup before this participant source can be used.":
    "\u8865\u9f50\u7f3a\u5931\u7684\u8bbe\u7f6e\u540e\uff0c\u6b64\u53c2\u4e0e\u8005\u6765\u6e90\u624d\u80fd\u4f7f\u7528\u3002",
  "Not enabled": "\u672a\u542f\u7528",
  "Enable this provider locally before it can appear in discussions.":
    "\u5148\u5728\u672c\u5730\u542f\u7528\u6b64\u63d0\u4f9b\u65b9\uff0c\u5b83\u624d\u80fd\u51fa\u73b0\u5728\u8ba8\u8bba\u4e2d\u3002",
  "Configure provider locally": "\u5728\u672c\u5730\u914d\u7f6e\u63d0\u4f9b\u65b9",
  "Use the Web setup form for API key, base URL, and model, then check readiness so the provider becomes active.":
    "\u4f7f\u7528 Web \u8bbe\u7f6e\u8868\u5355\u914d\u7f6e API key\u3001base URL \u548c model\uff0c\u7136\u540e\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\uff0c\u8ba9\u63d0\u4f9b\u65b9\u751f\u6548\u3002",
  "Start a discussion and choose configured participants or model-backed discussion plans when needed.":
    "\u5f00\u59cb\u8ba8\u8bba\uff0c\u5e76\u5728\u9700\u8981\u65f6\u9009\u62e9\u5df2\u914d\u7f6e\u7684\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u8ba1\u5212\u3002",
  "Start with the local preset now, then add a real provider before relying on model-backed results.":
    "\u73b0\u5728\u53ef\u4ee5\u5148\u4f7f\u7528\u672c\u5730\u9884\u8bbe\uff1b\u5728\u4f9d\u8d56\u6a21\u578b\u652f\u6301\u7684\u7ed3\u679c\u524d\uff0c\u8bf7\u6dfb\u52a0\u771f\u5b9e\u63d0\u4f9b\u65b9\u3002",
  "Add model setup first": "\u5148\u6dfb\u52a0\u6a21\u578b\u8bbe\u7f6e",
  "Configure at least one local participant source before starting a model-backed discussion.":
    "\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u81f3\u5c11\u914d\u7f6e\u4e00\u4e2a\u672c\u5730\u53c2\u4e0e\u8005\u6765\u6e90\u3002",
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
  "Model setup for this discussion": "\u672c\u6b21\u8ba8\u8bba\u7684\u6a21\u578b\u8bbe\u7f6e",
  "Know whether this start path will use demo participants or configured model providers before you create the discussion.":
    "\u521b\u5efa\u8ba8\u8bba\u524d\uff0c\u5148\u786e\u8ba4\u6b64\u5165\u53e3\u4f1a\u4f7f\u7528\u6f14\u793a\u53c2\u4e0e\u8005\u8fd8\u662f\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "Quick-start participants": "\u5feb\u901f\u5f00\u59cb\u53c2\u4e0e\u8005",
  "Model-backed participants": "\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005",
  "This page does not ask for API keys. Use Setup / Models to save provider setup, then return here.":
    "\u6b64\u9875\u9762\u4e0d\u4f1a\u8981\u6c42\u8f93\u5165 API key\u3002\u8bf7\u4f7f\u7528\u8bbe\u7f6e / \u6a21\u578b\u4fdd\u5b58\u63d0\u4f9b\u65b9\u8bbe\u7f6e\uff0c\u7136\u540e\u56de\u5230\u8fd9\u91cc\u3002",
  "This page does not show API keys. Use Setup / Models to save provider setup before starting real model-backed discussions.":
    "\u6b64\u9875\u9762\u4e0d\u663e\u793a API key\u3002\u5728\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u4f7f\u7528\u8bbe\u7f6e / \u6a21\u578b\u4fdd\u5b58\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u3002",
  "Choose participant source": "\u9009\u62e9\u53c2\u4e0e\u8005\u6765\u6e90",
  "Demo participants": "\u6f14\u793a\u53c2\u4e0e\u8005",
  "Start immediately with built-in sample participants.":
    "\u4f7f\u7528\u5185\u7f6e\u793a\u4f8b\u53c2\u4e0e\u8005\u7acb\u5373\u5f00\u59cb\u3002",
  "{provider} is ready. This discussion will use configured model participants from the local daemon.":
    "{provider} \u5df2\u5c31\u7eea\u3002\u6b64\u8ba8\u8bba\u5c06\u4f7f\u7528\u672c\u5730\u5b88\u62a4\u8fdb\u7a0b\u4e2d\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "{provider} is ready. This discussion will use configured model participants from the local service.":
    "{provider} \u5df2\u5c31\u7eea\u3002\u6b64\u8ba8\u8bba\u5c06\u4f7f\u7528\u672c\u5730\u670d\u52a1\u4e2d\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Configure a ready model provider locally before selecting model-backed participants.":
    "\u5148\u5728\u672c\u5730\u914d\u7f6e\u4e00\u4e2a\u5df2\u5c31\u7eea\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\uff0c\u7136\u540e\u518d\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\u3002",
  "Provider setup is saved. Use Verify connection here or in Setup / Models before selecting model-backed participants.":
    "\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u5df2\u4fdd\u5b58\u3002\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\u524d\uff0c\u8bf7\u5728\u6b64\u9875\u6216\u8bbe\u7f6e / \u6a21\u578b\u4e2d\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u3002",
  "Choose discussion depth": "\u9009\u62e9\u8ba8\u8bba\u6df1\u5ea6",
  "Focused review": "\u805a\u7126\u5ba1\u67e5",
  "Two independent model perspectives keep the discussion concise.":
    "\u4e24\u4e2a\u72ec\u7acb\u6a21\u578b\u89c6\u89d2\u53ef\u4f7f\u8ba8\u8bba\u4fdd\u6301\u7b80\u6d01\u3002",
  "Broader review": "\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5",
  "Three independent model perspectives give the room more comparison material.":
    "\u4e09\u4e2a\u72ec\u7acb\u6a21\u578b\u89c6\u89d2\u4f1a\u4e3a\u8ba8\u8bba\u5ba4\u63d0\u4f9b\u66f4\u591a\u6bd4\u8f83\u6750\u6599\u3002",
  "First-response model": "\u521d\u59cb\u56de\u5e94\u6a21\u578b",
  "Leave blank to use the model saved in Setup / Models. Perspectives without their own model use this value for first responses.":
    "\u7559\u7a7a\u5219\u4f7f\u7528\u8bbe\u7f6e / \u6a21\u578b\u4e2d\u4fdd\u5b58\u7684\u6a21\u578b\u3002\u6ca1\u6709\u5355\u72ec\u6a21\u578b\u7684\u89c6\u89d2\u4f1a\u4f7f\u7528\u6b64\u503c\u4f5c\u4e3a\u521d\u59cb\u56de\u5e94\u6a21\u578b\u3002",
  "Review role model": "\u5ba1\u67e5\u89d2\u8272\u6a21\u578b",
  "Leave blank to use the first-response model. A value here applies to Reviewer, Evidence checker, Risk reviewer, and Conclusion writer only.":
    "\u7559\u7a7a\u5219\u4f7f\u7528\u521d\u59cb\u56de\u5e94\u6a21\u578b\u3002\u8fd9\u91cc\u7684\u503c\u4ec5\u5e94\u7528\u4e8e\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u3001\u98ce\u9669\u5ba1\u67e5\u8005\u548c\u7ed3\u8bba\u64b0\u5199\u8005\u3002",
  "Role model defaults": "\u89d2\u8272\u6a21\u578b\u9ed8\u8ba4\u8bbe\u7f6e",
  "Save non-secret role model choices to the local service so future model-backed discussions start with the same setup.":
    "\u5c06\u975e\u5bc6\u94a5\u7684\u89d2\u8272\u6a21\u578b\u9009\u62e9\u4fdd\u5b58\u5230\u672c\u5730\u670d\u52a1\uff0c\u8ba9\u4ee5\u540e\u7684\u6a21\u578b\u652f\u6301\u8ba8\u8bba\u4f7f\u7528\u76f8\u540c\u8bbe\u7f6e\u5f00\u59cb\u3002",
  "Save as default role setup": "\u4fdd\u5b58\u4e3a\u9ed8\u8ba4\u89d2\u8272\u8bbe\u7f6e",
  "Apply saved role setup": "\u5e94\u7528\u5df2\u4fdd\u5b58\u7684\u89d2\u8272\u8bbe\u7f6e",
  "Clear saved role setup": "\u6e05\u9664\u5df2\u4fdd\u5b58\u7684\u89d2\u8272\u8bbe\u7f6e",
  "Saved role defaults to the local service. API keys and base URLs are not stored here.":
    "\u5df2\u5c06\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u4fdd\u5b58\u5230\u672c\u5730\u670d\u52a1\u3002\u8fd9\u91cc\u4e0d\u4fdd\u5b58 API key \u548c base URL\u3002",
  "Applied the saved role setup to this discussion.":
    "\u5df2\u5c06\u4fdd\u5b58\u7684\u89d2\u8272\u8bbe\u7f6e\u5e94\u7528\u5230\u672c\u6b21\u8ba8\u8bba\u3002",
  "Cleared saved role defaults from the local service. Current discussion fields are unchanged.":
    "\u5df2\u4ece\u672c\u5730\u670d\u52a1\u6e05\u9664\u4fdd\u5b58\u7684\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u3002\u5f53\u524d\u8ba8\u8bba\u5b57\u6bb5\u4e0d\u53d8\u3002",
  "Role defaults could not be changed in the local service. You can still create this discussion.":
    "\u65e0\u6cd5\u5728\u672c\u5730\u670d\u52a1\u4e2d\u66f4\u6539\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u3002\u4f60\u4ecd\u7136\u53ef\u4ee5\u521b\u5efa\u672c\u6b21\u8ba8\u8bba\u3002",
  "Saved role defaults are available from the local service.":
    "\u672c\u5730\u670d\u52a1\u4e2d\u5df2\u6709\u53ef\u7528\u7684\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u3002",
  "No saved role defaults yet. API keys and base URLs are never saved here.":
    "\u5c1a\u672a\u4fdd\u5b58\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u3002\u8fd9\u91cc\u6c38\u4e0d\u4fdd\u5b58 API key \u548c base URL\u3002",
  "Checking saved role defaults": "\u6b63\u5728\u68c0\u67e5\u5df2\u4fdd\u5b58\u7684\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e",
  "Saved role defaults unavailable":
    "\u5df2\u4fdd\u5b58\u7684\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u4e0d\u53ef\u7528",
  "Saved role defaults": "\u5df2\u4fdd\u5b58\u7684\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e",
  "No saved role defaults": "\u5c1a\u672a\u4fdd\u5b58\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e",
  "Checking whether the local service has a saved participant model setup.":
    "\u6b63\u5728\u68c0\u67e5\u672c\u5730\u670d\u52a1\u662f\u5426\u5df2\u6709\u4fdd\u5b58\u7684\u53c2\u4e0e\u8005\u6a21\u578b\u8bbe\u7f6e\u3002",
  "The local service did not return saved role defaults. You can still start or configure a discussion.":
    "\u672c\u5730\u670d\u52a1\u672a\u8fd4\u56de\u5df2\u4fdd\u5b58\u7684\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u3002\u4f60\u4ecd\u7136\u53ef\u4ee5\u5f00\u59cb\u6216\u914d\u7f6e\u8ba8\u8bba\u3002",
  "Setup / Models shows the saved participant model choices before you start. API keys, base URLs, and provider configuration ids are not returned here.":
    "\u8bbe\u7f6e / \u6a21\u578b\u4f1a\u5728\u5f00\u59cb\u524d\u663e\u793a\u5df2\u4fdd\u5b58\u7684\u53c2\u4e0e\u8005\u6a21\u578b\u9009\u62e9\u3002\u8fd9\u91cc\u4e0d\u4f1a\u8fd4\u56de API key\u3001base URL \u6216\u63d0\u4f9b\u65b9\u914d\u7f6e ID\u3002",
  "Save a default role setup from the start page, then Setup / Models will show which discussion depth and role models are ready for future discussions.":
    "\u4ece\u5f00\u59cb\u9875\u4fdd\u5b58\u9ed8\u8ba4\u89d2\u8272\u8bbe\u7f6e\u540e\uff0c\u8bbe\u7f6e / \u6a21\u578b\u4f1a\u663e\u793a\u672a\u6765\u8ba8\u8bba\u53ef\u7528\u7684\u8ba8\u8bba\u6df1\u5ea6\u548c\u89d2\u8272\u6a21\u578b\u3002",
  "Discussion depth": "\u8ba8\u8bba\u6df1\u5ea6",
  "Not saved yet": "\u5c1a\u672a\u4fdd\u5b58",
  "First responses use": "\u521d\u59cb\u56de\u5e94\u4f7f\u7528",
  "Provider setup model": "\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u6a21\u578b",
  "Review roles use": "\u5ba1\u67e5\u89d2\u8272\u4f7f\u7528",
  "Perspective models": "\u89c6\u89d2\u6a21\u578b",
  "1 custom perspective model": "1 \u4e2a\u81ea\u5b9a\u4e49\u89c6\u89d2\u6a21\u578b",
  "{count} custom perspective models": "{count} \u4e2a\u81ea\u5b9a\u4e49\u89c6\u89d2\u6a21\u578b",
  "Start with saved role setup": "\u4f7f\u7528\u5df2\u4fdd\u5b58\u89d2\u8272\u8bbe\u7f6e\u5f00\u59cb",
  "Edit role defaults": "\u7f16\u8f91\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e",
  "Create role defaults": "\u521b\u5efa\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e",
  "Edit default role setup": "\u7f16\u8f91\u9ed8\u8ba4\u89d2\u8272\u8bbe\u7f6e",
  "Choose default discussion depth": "\u9009\u62e9\u9ed8\u8ba4\u8ba8\u8bba\u6df1\u5ea6",
  "Leave blank to use the model saved in provider setup. Perspectives without their own model use this value for first responses.":
    "\u7559\u7a7a\u5219\u4f7f\u7528\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u4e2d\u4fdd\u5b58\u7684\u6a21\u578b\u3002\u6ca1\u6709\u5355\u72ec\u6a21\u578b\u7684\u89c6\u89d2\u4f1a\u4f7f\u7528\u6b64\u503c\u4f5c\u4e3a\u521d\u59cb\u56de\u5e94\u3002",
  "Saving role defaults": "\u6b63\u5728\u4fdd\u5b58\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e",
  "Role changes are not saved yet.":
    "\u89d2\u8272\u53d8\u66f4\u5c1a\u672a\u4fdd\u5b58\u3002",
  "Cleared saved role defaults from the local service.":
    "\u5df2\u4ece\u672c\u5730\u670d\u52a1\u6e05\u9664\u4fdd\u5b58\u7684\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u3002",
  "Role defaults could not be changed in the local service. You can still review setup and start a discussion.":
    "\u65e0\u6cd5\u5728\u672c\u5730\u670d\u52a1\u4e2d\u66f4\u6539\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u3002\u4f60\u4ecd\u7136\u53ef\u4ee5\u67e5\u770b\u8bbe\u7f6e\u5e76\u5f00\u59cb\u8ba8\u8bba\u3002",
  "Use saved model for perspectives": "\u4f7f\u7528\u5df2\u4fdd\u5b58\u7684\u89c6\u89d2\u6a21\u578b",
  "Use first-response model": "\u4f7f\u7528\u521d\u59cb\u56de\u5e94\u6a21\u578b",
  "Customize perspective models": "\u81ea\u5b9a\u4e49\u89c6\u89d2\u6a21\u578b",
  "Give individual first-response perspectives their own model. Leave a field blank to use the first-response model.":
    "\u4e3a\u5355\u4e2a\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u89c6\u89d2\u6307\u5b9a\u81ea\u5df1\u7684\u6a21\u578b\u3002\u7559\u7a7a\u5219\u4f7f\u7528\u521d\u59cb\u56de\u5e94\u6a21\u578b\u3002",
  "Perspective model assignment": "\u89c6\u89d2\u6a21\u578b\u5206\u914d",
  "Perspective A model": "\u89c6\u89d2 A \u6a21\u578b",
  "Perspective B model": "\u89c6\u89d2 B \u6a21\u578b",
  "Perspective C model": "\u89c6\u89d2 C \u6a21\u578b",
  "Perspective model overrides affect independent first responses only. Review roles use the review role model when one is set.":
    "\u89c6\u89d2\u6a21\u578b\u8986\u76d6\u4ec5\u5f71\u54cd\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002\u8bbe\u7f6e\u4e86\u5ba1\u67e5\u89d2\u8272\u6a21\u578b\u65f6\uff0c\u5ba1\u67e5\u89d2\u8272\u4f7f\u7528\u8be5\u6a21\u578b\u3002",
  "The selected depth controls how many independent model participants answer before Deliberum compares options.":
    "\u9009\u5b9a\u7684\u6df1\u5ea6\u4f1a\u51b3\u5b9a Deliberum \u6bd4\u8f83\u9009\u9879\u524d\uff0c\u6709\u591a\u5c11\u4e2a\u72ec\u7acb\u6a21\u578b\u53c2\u4e0e\u8005\u5148\u56de\u5e94\u3002",
  "Demo walkthroughs use two built-in sample perspectives. Choose model-backed participants to use a broader independent review.":
    "\u6f14\u793a\u6d41\u7a0b\u4f7f\u7528\u4e24\u4e2a\u5185\u7f6e\u793a\u4f8b\u89c6\u89d2\u3002\u8bf7\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\u6765\u4f7f\u7528\u66f4\u5e7f\u7684\u72ec\u7acb\u5ba1\u67e5\u3002",
  "Participant lineup": "\u53c2\u4e0e\u8005\u9635\u5bb9",
  "Participants for this discussion": "\u672c\u6b21\u8ba8\u8bba\u7684\u53c2\u4e0e\u8005",
  "Before creating the discussion, see who will answer first and who will review the result.":
    "\u521b\u5efa\u8ba8\u8bba\u524d\uff0c\u5148\u770b\u6e05\u8c01\u4f1a\u5148\u56de\u5e94\uff0c\u4ee5\u53ca\u8c01\u4f1a\u5ba1\u67e5\u7ed3\u679c\u3002",
  "Independent first response": "\u72ec\u7acb\u521d\u59cb\u56de\u5e94",
  "Saved model setup": "\u5df2\u4fdd\u5b58\u7684\u6a21\u578b\u8bbe\u7f6e",
  "Perspectives without their own model use this first-response model.":
    "\u6ca1\u6709\u5355\u72ec\u6a21\u578b\u7684\u89c6\u89d2\u4f7f\u7528\u8fd9\u4e2a\u521d\u59cb\u56de\u5e94\u6a21\u578b\u3002",
  "Perspectives without their own model use the model saved in Setup / Models.":
    "\u6ca1\u6709\u5355\u72ec\u6a21\u578b\u7684\u89c6\u89d2\u4f7f\u7528\u8bbe\u7f6e / \u6a21\u578b\u4e2d\u4fdd\u5b58\u7684\u6a21\u578b\u3002",
  "Review roles use this model while first-response perspectives keep their assigned models.":
    "\u5ba1\u67e5\u89d2\u8272\u4f7f\u7528\u8fd9\u4e2a\u6a21\u578b\uff0c\u521d\u59cb\u56de\u5e94\u89c6\u89d2\u4fdd\u6301\u5404\u81ea\u5206\u914d\u7684\u6a21\u578b\u3002",
  "Review roles use the same model as first-response perspectives.":
    "\u5ba1\u67e5\u89d2\u8272\u4f7f\u7528\u4e0e\u521d\u59cb\u56de\u5e94\u89c6\u89d2\u76f8\u540c\u7684\u6a21\u578b\u3002",
  "Perspective models customized": "\u5df2\u81ea\u5b9a\u4e49\u89c6\u89d2\u6a21\u578b",
  "Customized perspective models only affect independent first responses. Review roles use the review role model when one is set.":
    "\u81ea\u5b9a\u4e49\u89c6\u89d2\u6a21\u578b\u4ec5\u5f71\u54cd\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002\u8bbe\u7f6e\u4e86\u5ba1\u67e5\u89d2\u8272\u6a21\u578b\u65f6\uff0c\u5ba1\u67e5\u89d2\u8272\u4f7f\u7528\u8be5\u6a21\u578b\u3002",
  "Requirements and disagreement review": "\u8981\u6c42\u4e0e\u5206\u6b67\u5ba1\u67e5",
  "Evidence and risk review": "\u8bc1\u636e\u4e0e\u98ce\u9669\u5ba1\u67e5",
  "Current conclusion draft": "\u5f53\u524d\u7ed3\u8bba\u8349\u7a3f",
  "Configured model provider": "\u5df2\u914d\u7f6e\u6a21\u578b\u63d0\u4f9b\u65b9",
  "{provider} will answer through the configured local daemon setup.":
    "{provider} \u5c06\u901a\u8fc7\u5df2\u914d\u7f6e\u7684\u672c\u5730\u5b88\u62a4\u8fdb\u7a0b\u8bbe\u7f6e\u56de\u5e94\u3002",
  "{provider} will answer through the configured local setup.":
    "{provider} \u5c06\u901a\u8fc7\u5df2\u914d\u7f6e\u7684\u672c\u5730\u8bbe\u7f6e\u56de\u5e94\u3002",
  "Uses built-in demo material for a deterministic walkthrough.":
    "\u4f7f\u7528\u5185\u7f6e\u6f14\u793a\u6750\u6599\uff0c\u7528\u4e8e\u786e\u5b9a\u6027\u6f14\u793a\u6d41\u7a0b\u3002",
  "No ready participant source is available yet.":
    "\u5c1a\u65e0\u5c31\u7eea\u7684\u53c2\u4e0e\u8005\u6765\u6e90\u3002",
  "Local review roles can compare options, review evidence and risks, and draft the current conclusion after first responses.":
    "\u672c\u5730\u5ba1\u67e5\u89d2\u8272\u53ef\u5728\u521d\u59cb\u56de\u5e94\u540e\u6bd4\u8f83\u9009\u9879\u3001\u5ba1\u67e5\u8bc1\u636e\u548c\u98ce\u9669\uff0c\u5e76\u8d77\u8349\u5f53\u524d\u7ed3\u8bba\u3002",
  "Review roles are not ready yet; continuing the discussion may collect first responses only.":
    "\u5ba1\u67e5\u89d2\u8272\u5c1a\u672a\u5c31\u7eea\uff1b\u7ee7\u7eed\u8ba8\u8bba\u53ef\u80fd\u53ea\u4f1a\u6536\u96c6\u521d\u59cb\u56de\u5e94\u3002",
  "Choose an available participant source before creating the discussion.":
    "\u521b\u5efa\u8ba8\u8bba\u524d\uff0c\u8bf7\u9009\u62e9\u4e00\u4e2a\u53ef\u7528\u7684\u53c2\u4e0e\u8005\u6765\u6e90\u3002",
  "Model-backed start available": "\u53ef\u4f7f\u7528\u6a21\u578b\u652f\u6301\u7684\u5f00\u59cb\u65b9\u5f0f",
  "A ready model provider is available. Web selects model-backed participants by default; use demo participants only for walkthroughs.":
    "\u5df2\u6709\u5c31\u7eea\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002Web \u9ed8\u8ba4\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\uff1b\u4ec5\u5728\u9700\u8981\u6f14\u793a\u6d41\u7a0b\u65f6\u4f7f\u7528\u6f14\u793a\u53c2\u4e0e\u8005\u3002",
  "Demo participants remain available when you want a deterministic walkthrough without provider calls.":
    "\u5982\u679c\u9700\u8981\u4e0d\u8c03\u7528\u63d0\u4f9b\u65b9\u7684\u786e\u5b9a\u6027\u6f14\u793a\u6d41\u7a0b\uff0c\u4ecd\u53ef\u4f7f\u7528\u6f14\u793a\u53c2\u4e0e\u8005\u3002",
  "A configured model provider is selected for this discussion by default.":
    "\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u4f1a\u9ed8\u8ba4\u7528\u4e8e\u6b64\u8ba8\u8bba\u3002",
  "Demo start, provider verification needed": "\u53ef\u5f00\u59cb\u6f14\u793a\uff0c\u4f46\u9700\u8981\u9a8c\u8bc1\u63d0\u4f9b\u65b9",
  "Provider verification needed": "\u9700\u8981\u9a8c\u8bc1\u63d0\u4f9b\u65b9",
  "The quick-start form can start now with demo participants. Use Verify connection on this page to unlock model-backed participants.":
    "\u5feb\u901f\u5f00\u59cb\u8868\u5355\u73b0\u5728\u53ef\u4ee5\u4f7f\u7528\u6f14\u793a\u53c2\u4e0e\u8005\u542f\u52a8\u3002\u8bf7\u5728\u6b64\u9875\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u6765\u89e3\u9501\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\u3002",
  "Use Verify connection on this page to unlock model-backed participants for this discussion.":
    "\u8bf7\u5728\u6b64\u9875\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u6765\u89e3\u9501\u672c\u6b21\u8ba8\u8bba\u7684\u6a21\u578b\u652f\u6301\u53c2\u4e0e\u8005\u3002",
  "Demo participants are not enabled in this local service.":
    "\u6b64\u672c\u5730\u670d\u52a1\u672a\u542f\u7528\u6f14\u793a\u53c2\u4e0e\u8005\u3002",
  "Provider setup is saved; use Verify connection here or in Setup / Models before relying on model-backed results.":
    "\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u5df2\u4fdd\u5b58\uff1b\u4f9d\u8d56\u6a21\u578b\u652f\u6301\u7684\u7ed3\u679c\u524d\uff0c\u8bf7\u5728\u6b64\u9875\u6216\u8bbe\u7f6e / \u6a21\u578b\u4e2d\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u3002",
  "Model-backed discussion selected": "\u5df2\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba",
  "This discussion will use configured model participants from your local setup.":
    "\u672c\u6b21\u8ba8\u8bba\u5c06\u4f7f\u7528\u4f60\u672c\u5730\u8bbe\u7f6e\u4e2d\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
  "Participant source": "\u53c2\u4e0e\u8005\u6765\u6e90",
  "Model-backed discussion": "\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba",
  "Continue discussion will ask configured model participants for the independent first responses.":
    "\u7ee7\u7eed\u8ba8\u8bba\u65f6\uff0c\u5c06\u8bf7\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u751f\u6210\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002",
  "Provider credentials stay on this machine; Web does not show saved API keys.":
    "\u63d0\u4f9b\u65b9\u51ed\u636e\u4fdd\u7559\u5728\u8fd9\u53f0\u673a\u5668\u4e0a\uff1bWeb \u4e0d\u663e\u793a\u5df2\u4fdd\u5b58\u7684 API key\u3002",
  "Demo participant discussion": "\u6f14\u793a\u53c2\u4e0e\u8005\u8ba8\u8bba",
  "Continue discussion uses built-in demo participants so the full flow works without provider setup.":
    "\u7ee7\u7eed\u8ba8\u8bba\u4f1a\u4f7f\u7528\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005\uff0c\u56e0\u6b64\u65e0\u9700\u914d\u7f6e\u63d0\u4f9b\u65b9\u4e5f\u80fd\u8dd1\u901a\u5b8c\u6574\u6d41\u7a0b\u3002",
  "Use Setup / Models when you want real provider-backed model participants.":
    "\u5982\u679c\u9700\u8981\u771f\u5b9e\u63d0\u4f9b\u65b9\u652f\u6301\u7684\u6a21\u578b\u53c2\u4e0e\u8005\uff0c\u8bf7\u4f7f\u7528\u8bbe\u7f6e / \u6a21\u578b\u3002",
  "Configured participant discussion": "\u5df2\u914d\u7f6e\u53c2\u4e0e\u8005\u8ba8\u8bba",
  "Continue discussion uses the participant source already attached to this discussion.":
    "\u7ee7\u7eed\u8ba8\u8bba\u4f1a\u4f7f\u7528\u5df2\u9644\u52a0\u5230\u6b64\u8ba8\u8bba\u7684\u53c2\u4e0e\u8005\u6765\u6e90\u3002",
  "Advanced mode keeps the underlying adapter and provider identifiers available for developers.":
    "\u9ad8\u7ea7\u6a21\u5f0f\u4f1a\u4fdd\u7559\u5e95\u5c42 adapter \u548c provider \u6807\u8bc6\uff0c\u4f9b\u5f00\u53d1\u8005\u67e5\u770b\u3002",
  "Participant source unavailable": "\u53c2\u4e0e\u8005\u6765\u6e90\u4e0d\u53ef\u7528",
  "This discussion does not show a usable participant source yet.":
    "\u6b64\u8ba8\u8bba\u5c1a\u672a\u663e\u793a\u53ef\u7528\u7684\u53c2\u4e0e\u8005\u6765\u6e90\u3002",
  "Open Setup / Models before relying on this discussion.":
    "\u5728\u4f9d\u8d56\u6b64\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b\u3002",
  "Continuation setup": "\u7ee7\u7eed\u8ba8\u8bba\u8bbe\u7f6e",
  "Checking continuation setup": "\u6b63\u5728\u68c0\u67e5\u7ee7\u7eed\u8ba8\u8bba\u8bbe\u7f6e",
  "Web is checking which local participant and review path is currently ready.":
    "Web \u6b63\u5728\u68c0\u67e5\u5f53\u524d\u54ea\u4e2a\u672c\u5730\u53c2\u4e0e\u8005\u548c\u5ba1\u67e5\u8def\u5f84\u5df2\u5c31\u7eea\u3002",
  "The recommended request updates after the daemon returns safe setup status.":
    "\u5b88\u62a4\u8fdb\u7a0b\u8fd4\u56de\u5b89\u5168\u8bbe\u7f6e\u72b6\u6001\u540e\uff0c\u63a8\u8350\u8bf7\u6c42\u4f1a\u66f4\u65b0\u3002",
  "Setup readiness unavailable": "\u8bbe\u7f6e\u5c31\u7eea\u72b6\u6001\u4e0d\u53ef\u7528",
  "Web could not confirm model setup, so the recommended request stays on the built-in guided path.":
    "Web \u65e0\u6cd5\u786e\u8ba4\u6a21\u578b\u8bbe\u7f6e\uff0c\u56e0\u6b64\u63a8\u8350\u8bf7\u6c42\u4fdd\u6301\u5728\u5185\u7f6e\u5f15\u5bfc\u8def\u5f84\u3002",
  "Open Setup / Models after the daemon is reachable to verify real provider readiness.":
    "\u5b88\u62a4\u8fdb\u7a0b\u53ef\u8fde\u63a5\u540e\uff0c\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b\u4ee5\u9a8c\u8bc1\u771f\u5b9e\u63d0\u4f9b\u65b9\u5c31\u7eea\u72b6\u6001\u3002",
  "Fill recommended continuation request": "\u586b\u5145\u63a8\u8350\u7684\u7ee7\u7eed\u8bf7\u6c42",
  "Model-backed review path ready":
    "\u6a21\u578b\u652f\u6301\u7684\u5ba1\u67e5\u8def\u5f84\u5df2\u5c31\u7eea",
  "Continue discussion will ask configured model participants for independent first responses, then use Reviewer, Evidence checker, Risk reviewer, and Conclusion writer to review the result.":
    "\u7ee7\u7eed\u8ba8\u8bba\u4f1a\u5148\u8bf7\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u751f\u6210\u72ec\u7acb\u521d\u59cb\u56de\u5e94\uff0c\u7136\u540e\u4f7f\u7528\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u3001\u98ce\u9669\u5ba1\u67e5\u8005\u548c\u7ed3\u8bba\u8d77\u8349\u8005\u5ba1\u67e5\u7ed3\u679c\u3002",
  "Collect model first responses, then use review roles for options, disagreements, risks, and the draft conclusion.":
    "\u6536\u96c6\u6a21\u578b\u521d\u59cb\u56de\u5e94\uff0c\u7136\u540e\u4f7f\u7528\u5ba1\u67e5\u89d2\u8272\u6574\u7406\u9009\u9879\u3001\u5206\u6b67\u3001\u98ce\u9669\u548c\u7ed3\u8bba\u8349\u7a3f\u3002",
  "Model-backed discussion continued": "\u5df2\u7ee7\u7eed\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba",
  "Model participants and review roles updated the readable timeline and conclusion materials.":
    "\u6a21\u578b\u53c2\u4e0e\u8005\u548c\u5ba1\u67e5\u89d2\u8272\u5df2\u66f4\u65b0\u53ef\u8bfb\u65f6\u95f4\u7ebf\u548c\u7ed3\u8bba\u6750\u6599\u3002",
  "Model first responses ready": "\u6a21\u578b\u521d\u59cb\u56de\u5e94\u5df2\u5c31\u7eea",
  "Configured model participants can answer first, but the full review path is not ready in the current setup.":
    "\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u53ef\u4ee5\u5148\u56de\u5e94\uff0c\u4f46\u5f53\u524d\u8bbe\u7f6e\u4e2d\u5b8c\u6574\u5ba1\u67e5\u8def\u5f84\u5c1a\u672a\u5c31\u7eea\u3002",
  "Continue discussion will collect independent first responses only until the local service reports a complete model review path.":
    "\u5728\u672c\u5730\u670d\u52a1\u62a5\u544a\u5b8c\u6574\u6a21\u578b\u5ba1\u67e5\u8def\u5f84\u524d\uff0c\u7ee7\u7eed\u8ba8\u8bba\u53ea\u4f1a\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002",
  "Fill first responses request": "\u586b\u5145\u521d\u59cb\u56de\u5e94\u8bf7\u6c42",
  "Collect independent first responses only; finish review role setup before generating strongest options or a conclusion.":
    "\u4ec5\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\uff1b\u751f\u6210\u6700\u5f3a\u9009\u9879\u6216\u7ed3\u8bba\u524d\uff0c\u8bf7\u5148\u5b8c\u6210\u5ba1\u67e5\u89d2\u8272\u8bbe\u7f6e\u3002",
  "First responses collected": "\u5df2\u6536\u96c6\u521d\u59cb\u56de\u5e94",
  "The discussion collected independent first responses. Finish review role setup before organizing options or drafting a conclusion.":
    "\u8ba8\u8bba\u5df2\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002\u6574\u7406\u9009\u9879\u6216\u8d77\u8349\u7ed3\u8bba\u524d\uff0c\u8bf7\u5148\u5b8c\u6210\u5ba1\u67e5\u89d2\u8272\u8bbe\u7f6e\u3002",
  "Full demo discussion path ready": "\u5b8c\u6574\u6f14\u793a\u8ba8\u8bba\u8def\u5f84\u5df2\u5c31\u7eea",
  "Continue discussion can use built-in demo participants and local review roles for the full room flow without provider setup.":
    "\u7ee7\u7eed\u8ba8\u8bba\u53ef\u4ee5\u4f7f\u7528\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005\u548c\u672c\u5730\u5ba1\u67e5\u89d2\u8272\uff0c\u65e0\u9700\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u4e5f\u80fd\u5b8c\u6210\u8ba8\u8bba\u5ba4\u6d41\u7a0b\u3002",
  "Configure a model provider in Setup / Models before relying on real model-backed results.":
    "\u5728\u4f9d\u8d56\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u7ed3\u679c\u524d\uff0c\u8bf7\u5148\u5728\u8bbe\u7f6e / \u6a21\u578b\u4e2d\u914d\u7f6e\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "First responses only": "\u4ec5\u521d\u59cb\u56de\u5e94",
  "This discussion can only collect independent first responses until a local participant or provider review path is ready.":
    "\u5728\u672c\u5730\u53c2\u4e0e\u8005\u6216\u63d0\u4f9b\u65b9\u5ba1\u67e5\u8def\u5f84\u5c31\u7eea\u524d\uff0c\u6b64\u8ba8\u8bba\u53ea\u80fd\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002",
  "Open Setup / Models to configure a demo preset or real model provider before relying on the discussion.":
    "\u5728\u4f9d\u8d56\u8ba8\u8bba\u524d\uff0c\u8bf7\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b\u914d\u7f6e\u6f14\u793a\u9884\u8bbe\u6216\u771f\u5b9e\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "Provider-ready start": "\u63d0\u4f9b\u65b9\u5df2\u5c31\u7eea",
  "At least one real model provider is ready. The quick-start form still uses demo participants; use a model-backed discussion plan when you want provider-backed perspectives.":
    "\u81f3\u5c11\u4e00\u4e2a\u771f\u5b9e\u6a21\u578b\u63d0\u4f9b\u65b9\u5df2\u5c31\u7eea\u3002\u5feb\u901f\u5f00\u59cb\u8868\u5355\u4ecd\u4f7f\u7528\u6f14\u793a\u53c2\u4e0e\u8005\uff1b\u9700\u8981\u63d0\u4f9b\u65b9\u652f\u6301\u7684\u89c6\u89d2\u65f6\uff0c\u8bf7\u4f7f\u7528\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u8ba1\u5212\u3002",
  "The plain-language form starts with built-in demo participants so the first discussion works immediately.":
    "\u81ea\u7136\u8bed\u8a00\u8868\u5355\u4f1a\u5148\u4f7f\u7528\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005\uff0c\u56e0\u6b64\u7b2c\u4e00\u6b21\u8ba8\u8bba\u53ef\u4ee5\u7acb\u5373\u8fd0\u884c\u3002",
  "Real provider-backed participants are available for model-backed plans.":
    "\u771f\u5b9e\u63d0\u4f9b\u65b9\u652f\u6301\u7684\u53c2\u4e0e\u8005\u53ef\u7528\u4e8e\u6a21\u578b\u652f\u6301\u7684\u8ba1\u5212\u3002",
  "Demo start, provider details needed": "\u53ef\u6f14\u793a\u5f00\u59cb\uff0c\u4ecd\u9700\u63d0\u4f9b\u65b9\u7ec6\u8282",
  "The quick-start form can start now with demo participants. A provider is enabled, but model details still need Web setup or per-discussion model settings.":
    "\u5feb\u901f\u5f00\u59cb\u8868\u5355\u73b0\u5728\u53ef\u4ee5\u7528\u6f14\u793a\u53c2\u4e0e\u8005\u5f00\u59cb\u3002\u5df2\u6709\u63d0\u4f9b\u65b9\u542f\u7528\uff0c\u4f46\u6a21\u578b\u7ec6\u8282\u4ecd\u9700\u8981 Web \u8bbe\u7f6e\u6216\u6bcf\u6b21\u8ba8\u8bba\u7684\u6a21\u578b\u8bbe\u7f6e\u3002",
  "Provider enabled; add base URL and model locally before relying on model-backed results.":
    "\u63d0\u4f9b\u65b9\u5df2\u542f\u7528\uff1b\u5728\u4f9d\u8d56\u6a21\u578b\u652f\u6301\u7684\u7ed3\u679c\u524d\uff0c\u8bf7\u5148\u5728\u672c\u5730\u6dfb\u52a0 base URL \u548c model\u3002",
  "Demo start ready": "\u6f14\u793a\u5f00\u59cb\u5df2\u5c31\u7eea",
  "You can start with built-in demo participants now. Configure a real provider before relying on model-backed results.":
    "\u73b0\u5728\u53ef\u4ee5\u4f7f\u7528\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005\u5f00\u59cb\u3002\u5728\u4f9d\u8d56\u6a21\u578b\u652f\u6301\u7684\u7ed3\u679c\u524d\uff0c\u8bf7\u914d\u7f6e\u771f\u5b9e\u63d0\u4f9b\u65b9\u3002",
  "No real model provider is ready yet. Configure one locally before relying on model-backed discussions.":
    "\u5c1a\u65e0\u771f\u5b9e\u6a21\u578b\u63d0\u4f9b\u65b9\u5c31\u7eea\u3002\u5728\u4f9d\u8d56\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u5728\u672c\u5730\u914d\u7f6e\u4e00\u4e2a\u63d0\u4f9b\u65b9\u3002",
  "Model setup needed": "\u9700\u8981\u6a21\u578b\u8bbe\u7f6e",
  "No demo participant or real provider is ready. Configure at least one participant source locally before starting a useful discussion.":
    "\u6ca1\u6709\u6f14\u793a\u53c2\u4e0e\u8005\u6216\u771f\u5b9e\u63d0\u4f9b\u65b9\u5c31\u7eea\u3002\u5f00\u59cb\u6709\u7528\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u81f3\u5c11\u5728\u672c\u5730\u914d\u7f6e\u4e00\u4e2a\u53c2\u4e0e\u8005\u6765\u6e90\u3002",
  "The quick-start form needs at least one local participant source before it can create useful discussion material.":
    "\u5feb\u901f\u5f00\u59cb\u8868\u5355\u9700\u8981\u81f3\u5c11\u4e00\u4e2a\u672c\u5730\u53c2\u4e0e\u8005\u6765\u6e90\uff0c\u624d\u80fd\u521b\u5efa\u6709\u7528\u7684\u8ba8\u8bba\u6750\u6599\u3002",
  "Describe what you need to decide or clarify. Deliberum will structure the discussion so the conclusion, disagreements, risks, evidence gaps, and next actions stay visible.":
    "\u63cf\u8ff0\u4f60\u9700\u8981\u51b3\u5b9a\u6216\u6f84\u6e05\u7684\u5185\u5bb9\u3002Deliberum \u4f1a\u7ec4\u7ec7\u8ba8\u8bba\uff0c\u8ba9\u7ed3\u8bba\u3001\u5206\u6b67\u3001\u98ce\u9669\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u4e0b\u4e00\u6b65\u4fdd\u6301\u53ef\u89c1\u3002",
  "Discussion question": "\u8ba8\u8bba\u95ee\u9898",
  Required: "\u5fc5\u586b",
  "What should we decide, compare, or clarify?": "\u6211\u4eec\u9700\u8981\u51b3\u5b9a\u3001\u6bd4\u8f83\u6216\u6f84\u6e05\u4ec0\u4e48\uff1f",
  "Creation preview": "\u521b\u5efa\u9884\u89c8",
  "Checking discussion path": "\u6b63\u5728\u68c0\u67e5\u8ba8\u8bba\u8def\u5f84",
  "Web is checking which participant source can create a useful discussion.":
    "Web \u6b63\u5728\u68c0\u67e5\u54ea\u4e2a\u53c2\u4e0e\u8005\u6765\u6e90\u53ef\u4ee5\u521b\u5efa\u6709\u7528\u7684\u8ba8\u8bba\u3002",
  "Who answers first": "\u8c01\u4f1a\u5148\u56de\u5e94",
  Checking: "\u6b63\u5728\u68c0\u67e5",
  "The available participant source will appear after setup status loads.":
    "\u8bbe\u7f6e\u72b6\u6001\u52a0\u8f7d\u540e\uff0c\u53ef\u7528\u53c2\u4e0e\u8005\u6765\u6e90\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
  "Who reviews the result": "\u8c01\u4f1a\u5ba1\u67e5\u7ed3\u679c",
  "Review role readiness appears after setup status loads.":
    "\u8bbe\u7f6e\u72b6\u6001\u52a0\u8f7d\u540e\uff0c\u5ba1\u67e5\u89d2\u8272\u5c31\u7eea\u72b6\u6001\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
  "After create": "\u521b\u5efa\u540e",
  "The next screen will show the room for this discussion.":
    "\u4e0b\u4e00\u4e2a\u9875\u9762\u4f1a\u663e\u793a\u672c\u6b21\u8ba8\u8bba\u7684\u8ba8\u8bba\u5ba4\u3002",
  "Ready to create a model-backed discussion": "\u53ef\u521b\u5efa\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba",
  "Configured model participants will answer first; review and conclusion roles can then structure options, disagreements, evidence gaps, risks, and a current conclusion.":
    "\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u4f1a\u5148\u56de\u5e94\uff1b\u7136\u540e\u5ba1\u67e5\u548c\u7ed3\u8bba\u89d2\u8272\u53ef\u4ee5\u6574\u7406\u9009\u9879\u3001\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u3001\u98ce\u9669\u548c\u5f53\u524d\u7ed3\u8bba\u3002",
  "Configured model participants can answer first, but review and conclusion roles are not ready yet.":
    "\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u53ef\u4ee5\u5148\u56de\u5e94\uff0c\u4f46\u5ba1\u67e5\u548c\u7ed3\u8bba\u89d2\u8272\u5c1a\u672a\u5c31\u7eea\u3002",
  "3 model perspectives": "3 \u4e2a\u6a21\u578b\u89c6\u89d2",
  "2 model perspectives": "2 \u4e2a\u6a21\u578b\u89c6\u89d2",
  "Perspective A, Perspective B, and Perspective C will answer independently.":
    "\u89c6\u89d2 A\u3001\u89c6\u89d2 B \u548c\u89c6\u89d2 C \u4f1a\u72ec\u7acb\u56de\u5e94\u3002",
  "Perspective A and Perspective B will answer independently.":
    "\u89c6\u89d2 A \u548c\u89c6\u89d2 B \u4f1a\u72ec\u7acb\u56de\u5e94\u3002",
  "API keys stay on this machine and are not shown on this page.":
    "API key \u4fdd\u7559\u5728\u8fd9\u53f0\u673a\u5668\u4e0a\uff0c\u4e14\u4e0d\u4f1a\u5728\u6b64\u9875\u663e\u793a\u3002",
  "Open the room, then continue the guided discussion to organize first responses into a reviewable conclusion.":
    "\u6253\u5f00\u8ba8\u8bba\u5ba4\uff0c\u7136\u540e\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u628a\u521d\u59cb\u56de\u5e94\u6574\u7406\u4e3a\u53ef\u5ba1\u9605\u7ed3\u8bba\u3002",
  "Open the room, then finish review role setup before expecting strongest options or a conclusion.":
    "\u6253\u5f00\u8ba8\u8bba\u5ba4\uff0c\u7136\u540e\u5148\u5b8c\u6210\u5ba1\u67e5\u89d2\u8272\u8bbe\u7f6e\uff0c\u518d\u671f\u5f85\u6700\u5f3a\u9009\u9879\u6216\u7ed3\u8bba\u3002",
  "Ready to create a demo discussion": "\u53ef\u521b\u5efa\u6f14\u793a\u8ba8\u8bba",
  "Built-in demo participants let first-time users try the full room flow before model setup.":
    "\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005\u53ef\u8ba9\u9996\u6b21\u7528\u6237\u5728\u5b8c\u6210\u6a21\u578b\u8bbe\u7f6e\u524d\u8bd5\u7528\u5b8c\u6574\u8ba8\u8bba\u5ba4\u6d41\u7a0b\u3002",
  "2 demo perspectives": "2 \u4e2a\u6f14\u793a\u89c6\u89d2",
  "Perspective A and Perspective B use deterministic sample material.":
    "\u89c6\u89d2 A \u548c\u89c6\u89d2 B \u4f7f\u7528\u786e\u5b9a\u6027\u793a\u4f8b\u6750\u6599\u3002",
  "Full discussion loop": "\u5b8c\u6574\u8ba8\u8bba\u5faa\u73af",
  "Local review roles can compare options, review risks, and draft the current conclusion.":
    "\u672c\u5730\u5ba1\u67e5\u89d2\u8272\u53ef\u4ee5\u6bd4\u8f83\u9009\u9879\u3001\u5ba1\u67e5\u98ce\u9669\u5e76\u8d77\u8349\u5f53\u524d\u7ed3\u8bba\u3002",
  "The discussion may collect first responses only until review roles are ready.":
    "\u5728\u5ba1\u67e5\u89d2\u8272\u5c31\u7eea\u524d\uff0c\u8ba8\u8bba\u53ef\u80fd\u53ea\u4f1a\u6536\u96c6\u521d\u59cb\u56de\u5e94\u3002",
  "Open the room, then continue the guided discussion to review the timeline and current result.":
    "\u6253\u5f00\u8ba8\u8bba\u5ba4\uff0c\u7136\u540e\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u5ba1\u9605\u65f6\u95f4\u7ebf\u548c\u5f53\u524d\u7ed3\u679c\u3002",
  "Finish setup before creating": "\u521b\u5efa\u524d\u8bf7\u5148\u5b8c\u6210\u8bbe\u7f6e",
  "Choose an available participant source in Setup / Models, then return here.":
    "\u8bf7\u5728\u8bbe\u7f6e / \u6a21\u578b\u4e2d\u9009\u62e9\u53ef\u7528\u7684\u53c2\u4e0e\u8005\u6765\u6e90\uff0c\u7136\u540e\u56de\u5230\u8fd9\u91cc\u3002",
  "Add a demo preset or real model provider before creating useful material.":
    "\u5728\u521b\u5efa\u6709\u7528\u6750\u6599\u524d\uff0c\u8bf7\u5148\u6dfb\u52a0\u6f14\u793a\u9884\u8bbe\u6216\u771f\u5b9e\u6a21\u578b\u63d0\u4f9b\u65b9\u3002",
  "Reviewer, Evidence checker, Risk reviewer, and Conclusion writer must be ready before Deliberum can prepare the conclusion.":
    "Deliberum \u9700\u8981\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u3001\u98ce\u9669\u5ba1\u67e5\u8005\u548c\u7ed3\u8bba\u8d77\u8349\u8005\u5c31\u7eea\u540e\u624d\u80fd\u51c6\u5907\u7ed3\u8bba\u3002",
  "Complete setup first, then start the discussion again.":
    "\u8bf7\u5148\u5b8c\u6210\u8bbe\u7f6e\uff0c\u7136\u540e\u91cd\u65b0\u5f00\u59cb\u8ba8\u8bba\u3002",
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
  "Resume latest discussion": "\u7ee7\u7eed\u6700\u65b0\u8ba8\u8bba",
  "More discussions": "\u66f4\u591a\u8ba8\u8bba",
  "{count} earlier discussion remains available.":
    "\u8fd8\u6709 {count} \u4e2a\u8f83\u65e9\u8ba8\u8bba\u53ef\u7528\u3002",
  "{count} earlier discussions remain available.":
    "\u8fd8\u6709 {count} \u4e2a\u8f83\u65e9\u8ba8\u8bba\u53ef\u7528\u3002",
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
  "Review status summary": "\u5ba1\u9605\u72b6\u6001\u6458\u8981",
  "Open the report-style status summary after reading the room conversation.":
    "\u9605\u8bfb\u8ba8\u8bba\u5ba4\u5bf9\u8bdd\u540e\uff0c\u518d\u6253\u5f00\u62a5\u544a\u5f0f\u72b6\u6001\u6458\u8981\u3002",
  "Discussion brief details": "\u8ba8\u8bba\u7b80\u62a5\u8be6\u60c5",
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
  "Discussion outputs": "\u8ba8\u8bba\u4ea7\u51fa",
  "Room output summary": "\u8ba8\u8bba\u5ba4\u4ea7\u51fa\u6458\u8981",
  "Quick links to options, disagreements, evidence, and conclusion":
    "\u5feb\u901f\u8df3\u8f6c\u5230\u9009\u9879\u3001\u5206\u6b67\u3001\u8bc1\u636e\u548c\u7ed3\u8bba",
  "What the room has produced": "\u8ba8\u8bba\u5ba4\u5df2\u7ecf\u4ea7\u51fa\u4e86\u4ec0\u4e48",
  "Open these shortcuts after reading the room conversation.":
    "\u9605\u8bfb\u8ba8\u8bba\u5ba4\u5bf9\u8bdd\u540e\uff0c\u518d\u6253\u5f00\u8fd9\u4e9b\u5feb\u6377\u8df3\u8f6c\u3002",
  "option ready to compare": "\u53ef\u6bd4\u8f83\u9009\u9879",
  "options ready to compare": "\u53ef\u6bd4\u8f83\u9009\u9879",
  "open disagreement to review": "\u5f85\u5ba1\u9605\u5206\u6b67",
  "open disagreements to review": "\u5f85\u5ba1\u9605\u5206\u6b67",
  "answer requirement to confirm": "\u5f85\u786e\u8ba4\u7b54\u6848\u8981\u6c42",
  "answer requirements to confirm": "\u5f85\u786e\u8ba4\u7b54\u6848\u8981\u6c42",
  "evidence gap to check": "\u5f85\u6838\u67e5\u8bc1\u636e\u7f3a\u53e3",
  "evidence gaps to check": "\u5f85\u6838\u67e5\u8bc1\u636e\u7f3a\u53e3",
  "A reviewable conclusion is ready with risks and next actions.":
    "\u53ef\u5ba1\u9605\u7ed3\u8bba\u5df2\u5c31\u7eea\uff0c\u5e76\u5305\u542b\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u3002",
  "Continue the discussion before relying on a conclusion.":
    "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\uff0c\u8bf7\u7ee7\u7eed\u63a8\u8fdb\u8ba8\u8bba\u3002",
  "Stage activity summary": "\u9636\u6bb5\u6d3b\u52a8\u6458\u8981",
  update: "\u66f4\u65b0",
  updates: "\u66f4\u65b0",
  "participant contribution": "\u53c2\u4e0e\u8005\u8d21\u732e",
  "participant contributions": "\u53c2\u4e0e\u8005\u8d21\u732e",
  Ready: "\u5df2\u5c31\u7eea",
  "Not started yet": "\u5c1a\u672a\u5f00\u59cb",
  "Needs review": "\u9700\u8981\u5ba1\u9605",
  "No open items visible": "\u6682\u65e0\u53ef\u89c1\u672a\u89e3\u51b3\u4e8b\u9879",
  Completed: "\u5df2\u5b8c\u6210",
  Updated: "\u5df2\u66f4\u65b0",
  "Already in progress": "\u5df2\u5728\u8fdb\u884c\u4e2d",
  "Discussion step": "\u8ba8\u8bba\u6b65\u9aa4",
  "Participant perspectives": "\u53c2\u4e0e\u8005\u89c6\u89d2",
  "What the strongest options say now": "\u5f53\u524d\u6700\u5f3a\u9009\u9879\u7684\u5185\u5bb9",
  "These options synthesize the discussion so far. Individual participant statements remain in the timeline above.":
    "\u8fd9\u4e9b\u9009\u9879\u662f\u5bf9\u76ee\u524d\u8ba8\u8bba\u7684\u7efc\u5408\u3002\u5355\u4e2a\u53c2\u4e0e\u8005\u7684\u53d1\u8a00\u4fdd\u7559\u5728\u4e0a\u65b9\u65f6\u95f4\u7ebf\u4e2d\u3002",
  "No strongest options visible yet": "\u5c1a\u65e0\u53ef\u89c1\u7684\u6700\u5f3a\u9009\u9879",
  "Continue the guided discussion so the room can organize participant statements into strongest current options.":
    "\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u8ba9\u8ba8\u8bba\u5ba4\u5c06\u53c2\u4e0e\u8005\u53d1\u8a00\u6574\u7406\u4e3a\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002",
  "Current room summary": "\u5f53\u524d\u8ba8\u8bba\u6458\u8981",
  "Decision workspace": "\u51b3\u7b56\u5de5\u4f5c\u533a",
  "Current conclusion: {status}": "\u5f53\u524d\u7ed3\u8bba\uff1a{status}",
  "Ready to review": "\u53ef\u5ba1\u9605",
  "Not ready yet": "\u5c1a\u672a\u5c31\u7eea",
  "Review the conclusion together with disagreements, evidence gaps, risks, and next actions.":
    "\u5c06\u7ed3\u8bba\u4e0e\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u3001\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u4e00\u8d77\u5ba1\u9605\u3002",
  "Continue the discussion before treating any answer as a conclusion.":
    "\u5728\u628a\u4efb\u4f55\u7b54\u6848\u5f53\u4f5c\u7ed3\u8bba\u524d\uff0c\u5148\u7ee7\u7eed\u8ba8\u8bba\u3002",
  "Next action": "\u4e0b\u4e00\u6b65\u52a8\u4f5c",
  "Open the conclusion, then check disagreements, evidence, risks, and requirements before relying on it.":
    "\u6253\u5f00\u7ed3\u8bba\uff0c\u518d\u5728\u4f9d\u8d56\u5b83\u4e4b\u524d\u68c0\u67e5\u5206\u6b67\u3001\u8bc1\u636e\u3001\u98ce\u9669\u548c\u8981\u6c42\u3002",
  "Continue the guided flow to produce perspectives, disagreements, evidence checks, risks, and a conclusion.":
    "\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u6d41\u7a0b\uff0c\u4ee5\u751f\u6210\u89c6\u89d2\u3001\u5206\u6b67\u3001\u8bc1\u636e\u6838\u67e5\u3001\u98ce\u9669\u548c\u7ed3\u8bba\u3002",
  "What to review": "\u9700\u8981\u5ba1\u9605\u7684\u5185\u5bb9",
  "Missing evidence": "\u7f3a\u5931\u8bc1\u636e",
  "Requirements to satisfy": "\u9700\u8981\u6ee1\u8db3\u7684\u8981\u6c42",
  Risks: "\u98ce\u9669",
  "Review needed": "\u9700\u8981\u5ba1\u9605",
  "No open blockers visible": "\u6682\u65e0\u53ef\u89c1\u963b\u585e\u9879",
  "Open items remain visible here so the conclusion is not treated as final.":
    "\u672a\u89e3\u51b3\u4e8b\u9879\u4f1a\u6301\u7eed\u5728\u8fd9\u91cc\u53ef\u89c1\uff0c\u907f\u514d\u5c06\u7ed3\u8bba\u5f53\u4f5c\u6700\u7ec8\u7b54\u6848\u3002",
  "No unresolved blockers are visible in the room summary.":
    "\u8ba8\u8bba\u6458\u8981\u4e2d\u6682\u65e0\u53ef\u89c1\u672a\u89e3\u51b3\u963b\u585e\u9879\u3002",
  "Review current conclusion": "\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba",
  "Continue discussion": "\u7ee7\u7eed\u8ba8\u8bba",
  "Primary discussion actions": "\u4e3b\u8981\u8ba8\u8bba\u52a8\u4f5c",
  "Updates discussion": "\u66f4\u65b0\u8ba8\u8bba",
  "Review only": "\u4ec5\u67e5\u770b",
  "After it finishes, review the updated timeline and current conclusion.":
    "\u5b8c\u6210\u540e\uff0c\u8bf7\u67e5\u770b\u66f4\u65b0\u540e\u7684\u65f6\u95f4\u7ebf\u548c\u5f53\u524d\u7ed3\u8bba\u3002",
  "After it finishes, review the updated timeline and next recommended action.":
    "\u5b8c\u6210\u540e\uff0c\u8bf7\u67e5\u770b\u66f4\u65b0\u540e\u7684\u65f6\u95f4\u7ebf\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
  "After it finishes, compare the refreshed strongest options.":
    "\u5b8c\u6210\u540e\uff0c\u8bf7\u6bd4\u8f83\u5237\u65b0\u540e\u7684\u6700\u5f3a\u9009\u9879\u3002",
  "Jump only; this does not change the discussion.":
    "\u4ec5\u8df3\u8f6c\u67e5\u770b\uff1b\u4e0d\u4f1a\u6539\u53d8\u8ba8\u8bba\u3002",
  "Continue guided discussion": "\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba",
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
  "A readable summary of the current result. Advanced details keep source details and developer diagnostics out of the default view.":
    "\u5f53\u524d\u7ed3\u679c\u7684\u53ef\u8bfb\u6458\u8981\u3002\u6765\u6e90\u8be6\u60c5\u548c\u5f00\u53d1\u8005\u8bca\u65ad\u4fdd\u7559\u5728\u9ad8\u7ea7\u8be6\u60c5\u4e2d\uff0c\u4e0d\u4f1a\u51fa\u73b0\u5728\u9ed8\u8ba4\u89c6\u56fe\u3002",
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
  "Use the current conclusion as reviewable material.":
    "\u5c06\u5f53\u524d\u7ed3\u8bba\u4f5c\u4e3a\u53ef\u5ba1\u9605\u6750\u6599\u3002",
  "Compiled from accepted discussion material only.":
    "\u4ec5\u6839\u636e\u5df2\u63a5\u53d7\u7684\u8ba8\u8bba\u6750\u6599\u7f16\u5236\u3002",
  "Risks and boundaries": "\u98ce\u9669\u4e0e\u8fb9\u754c",
  "Conclusion review path": "\u7ed3\u8bba\u5ba1\u9605\u8def\u5f84",
  "Review path": "\u5ba1\u9605\u8def\u5f84",
  "Before relying on this conclusion": "\u5728\u4f9d\u8d56\u6b64\u7ed3\u8bba\u4e4b\u524d",
  "Start with the recommendation, then check disagreements, evidence gaps, risks, answer requirements, and next recommended actions.":
    "\u5148\u9605\u8bfb\u5efa\u8bae\uff0c\u518d\u68c0\u67e5\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u3001\u98ce\u9669\u3001\u7b54\u6848\u8981\u6c42\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
  "Read the recommendation": "\u9605\u8bfb\u5efa\u8bae",
  "Use the current recommendation as reviewable material, not as an unquestioned final answer.":
    "\u5c06\u5f53\u524d\u5efa\u8bae\u4f5c\u4e3a\u53ef\u5ba1\u9605\u6750\u6599\uff0c\u800c\u4e0d\u662f\u65e0\u9700\u8d28\u7591\u7684\u6700\u7ec8\u7b54\u6848\u3002",
  "Check missing evidence": "\u68c0\u67e5\u7f3a\u5931\u8bc1\u636e",
  "Review risks and boundaries": "\u5ba1\u9605\u98ce\u9669\u4e0e\u8fb9\u754c",
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
  "Option {number}": "\u9009\u9879 {number}",
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
  "Explored option listed": "\u5df2\u5217\u51fa\u63a2\u7d22\u9009\u9879",
  "Explored options listed": "\u5df2\u5217\u51fa\u63a2\u7d22\u9009\u9879",
  "visible perspective": "\u53ef\u89c1\u89c2\u70b9",
  "visible perspectives": "\u53ef\u89c1\u89c2\u70b9",
  "Perspective visible": "\u53ef\u89c1\u89c2\u70b9",
  "Perspectives visible": "\u53ef\u89c1\u89c2\u70b9",
  "open disagreement": "\u672a\u89e3\u51b3\u5206\u6b67",
  "open disagreements": "\u672a\u89e3\u51b3\u5206\u6b67",
  "Disagreement still open": "\u4ecd\u6709\u672a\u89e3\u51b3\u5206\u6b67",
  "Disagreements still open": "\u4ecd\u6709\u672a\u89e3\u51b3\u5206\u6b67",
  "risk or boundary": "\u98ce\u9669\u6216\u8fb9\u754c",
  "risks or boundaries": "\u98ce\u9669\u6216\u8fb9\u754c",
  "Risk or boundary listed": "\u5df2\u5217\u51fa\u98ce\u9669\u6216\u8fb9\u754c",
  "Risks or boundaries listed": "\u5df2\u5217\u51fa\u98ce\u9669\u6216\u8fb9\u754c",
  "None listed": "\u5c1a\u672a\u5217\u51fa",
  "recommended next action": "\u4e0b\u4e00\u6b65\u5efa\u8bae",
  "recommended next actions": "\u4e0b\u4e00\u6b65\u5efa\u8bae",
  "open disagreement needs review": "\u9700\u8981\u5ba1\u9605\u7684\u672a\u89e3\u51b3\u5206\u6b67",
  "open disagreements need review": "\u9700\u8981\u5ba1\u9605\u7684\u672a\u89e3\u51b3\u5206\u6b67",
  "risk or boundary to review": "\u9700\u8981\u5ba1\u9605\u7684\u98ce\u9669\u6216\u8fb9\u754c",
  "risks or boundaries to review": "\u9700\u8981\u5ba1\u9605\u7684\u98ce\u9669\u6216\u8fb9\u754c",
  "answer requirement needs confirmation": "\u9700\u8981\u786e\u8ba4\u7684\u7b54\u6848\u8981\u6c42",
  "answer requirements need confirmation": "\u9700\u8981\u786e\u8ba4\u7684\u7b54\u6848\u8981\u6c42",
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
  Requirements: "\u8981\u6c42",
  Loading: "\u52a0\u8f7d\u4e2d",
  "Risks and evidence": "\u98ce\u9669\u4e0e\u8bc1\u636e",
  "Ledger events": "\u8d26\u672c\u4e8b\u4ef6",
  "Question or topic": "\u95ee\u9898\u6216\u4e3b\u9898",
  "No discussion brief available yet": "\u5c1a\u65e0\u53ef\u7528\u8ba8\u8bba\u7b80\u62a5",
  "Latest visible step": "\u6700\u65b0\u53ef\u89c1\u6b65\u9aa4",
  "Review this discussion": "\u5ba1\u9605\u672c\u6b21\u8ba8\u8bba",
  "View main perspectives": "\u67e5\u770b\u4e3b\u8981\u89c2\u70b9",
  "Review risks and evidence": "\u5ba1\u9605\u98ce\u9669\u4e0e\u8bc1\u636e",
  "Continue the discussion": "\u7ee7\u7eed\u8ba8\u8bba",
  "Evidence gaps visible": "\u5b58\u5728\u8bc1\u636e\u7f3a\u53e3",
  "No evidence gaps visible": "\u6682\u65e0\u53ef\u89c1\u8bc1\u636e\u7f3a\u53e3",
  "No missing evidence yet": "\u5c1a\u65e0\u7f3a\u5931\u8bc1\u636e",
  "{kind} {number}": "{kind} {number}",
  "Included as a strongest current option.":
    "\u5df2\u4f5c\u4e3a\u5f53\u524d\u6700\u5f3a\u9009\u9879\u7eb3\u5165\u8ba8\u8bba\u3002",
  "Still constrains the current conclusion.":
    "\u4ecd\u7136\u7ea6\u675f\u5f53\u524d\u7ed3\u8bba\u3002",
  "Needs an answer before relying on the conclusion.":
    "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\u4ecd\u9700\u56de\u7b54\u3002",
  "Needs verification before relying on the conclusion.":
    "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\u4ecd\u9700\u6838\u67e5\u3002",
  "Resolved for now.": "\u5f53\u524d\u5df2\u89e3\u51b3\u3002",
  "Review this item before relying on the conclusion.":
    "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\u8bf7\u5148\u5ba1\u9605\u6b64\u9879\u3002",
  "Visible in this discussion": "\u5728\u672c\u6b21\u8ba8\u8bba\u4e2d\u53ef\u89c1",
  "Still open": "\u4ecd\u672a\u89e3\u51b3",
  "Needs an answer": "\u9700\u8981\u56de\u7b54",
  "{count} update in this discussion so far.":
    "\u672c\u6b21\u8ba8\u8bba\u76ee\u524d\u6709 {count} \u6761\u66f4\u65b0\u3002",
  "{count} updates in this discussion so far.":
    "\u672c\u6b21\u8ba8\u8bba\u76ee\u524d\u6709 {count} \u6761\u66f4\u65b0\u3002",
  "The human-facing starting point for this discussion: what is being decided and where the discussion currently stands.":
    "\u672c\u6b21\u8ba8\u8bba\u9762\u5411\u4eba\u7684\u8d77\u70b9\uff1a\u6b63\u5728\u51b3\u5b9a\u4ec0\u4e48\uff0c\u4ee5\u53ca\u8ba8\u8bba\u5f53\u524d\u8fdb\u5c55\u5230\u54ea\u91cc\u3002",
  "The discussion setup is shown here in plain language.":
    "\u8fd9\u91cc\u7528\u81ea\u7136\u8bed\u8a00\u5c55\u793a\u8ba8\u8bba\u8bbe\u7f6e\u3002",
  "A quick human-readable snapshot of what is ready to inspect next.":
    "\u4e00\u4efd\u53ef\u8bfb\u5feb\u7167\uff0c\u663e\u793a\u63a5\u4e0b\u6765\u53ef\u4ee5\u68c0\u67e5\u4ec0\u4e48\u3002",
  "missing evidence item": "\u7f3a\u5931\u8bc1\u636e\u9879",
  "missing evidence items": "\u7f3a\u5931\u8bc1\u636e\u9879",
  "Start with the conclusion, then inspect the material that could change it.":
    "\u5148\u67e5\u770b\u7ed3\u8bba\uff0c\u518d\u68c0\u67e5\u53ef\u80fd\u6539\u53d8\u7ed3\u8bba\u7684\u6750\u6599\u3002",
  "Resolve evidence gaps before treating the conclusion as reliable.":
    "\u5728\u628a\u7ed3\u8bba\u89c6\u4e3a\u53ef\u9760\u4e4b\u524d\uff0c\u5148\u89e3\u51b3\u8bc1\u636e\u7f3a\u53e3\u3002",
  "Open disagreements show where the conclusion is still constrained.":
    "\u672a\u89e3\u51b3\u5206\u6b67\u4f1a\u663e\u793a\u7ed3\u8bba\u4ecd\u53d7\u5230\u54ea\u4e9b\u7ea6\u675f\u3002",
  "Unanswered requirements should be satisfied or explicitly acknowledged.":
    "\u5c1a\u672a\u56de\u7b54\u7684\u8981\u6c42\u5e94\u88ab\u6ee1\u8db3\uff0c\u6216\u88ab\u660e\u786e\u8bf4\u660e\u3002",
  "No main perspectives are visible yet. Continue the guided discussion before relying on the result.":
    "\u5c1a\u65e0\u53ef\u89c1\u4e3b\u8981\u89c2\u70b9\u3002\u8bf7\u5728\u4f9d\u8d56\u7ed3\u679c\u524d\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\u3002",
  "Open the current conclusion to see the result, caveats, and next steps together.":
    "\u6253\u5f00\u5f53\u524d\u7ed3\u8bba\uff0c\u4e00\u8d77\u67e5\u770b\u7ed3\u679c\u3001\u6ce8\u610f\u4e8b\u9879\u548c\u4e0b\u4e00\u6b65\u3002",
  "The strongest current options stay visible without selecting one hidden answer.":
    "\u5f53\u524d\u6700\u5f3a\u9009\u9879\u4fdd\u6301\u53ef\u89c1\uff0c\u800c\u4e0d\u4f1a\u6697\u4e2d\u9009\u5b9a\u4e00\u4e2a\u7b54\u6848\u3002",
  "These are the strongest currently visible perspectives. They remain open to challenge while the discussion continues.":
    "\u8fd9\u4e9b\u662f\u5f53\u524d\u53ef\u89c1\u7684\u6700\u5f3a\u89c6\u89d2\u3002\u5728\u8ba8\u8bba\u7ee7\u7eed\u65f6\uff0c\u5b83\u4eec\u4ecd\u7136\u53ef\u88ab\u6311\u6218\u3002",
  "No active candidates": "\u6682\u65e0\u6d3b\u8dc3\u5019\u9009\u9879",
  "Objections stay visible as unresolved disagreements that can still constrain the conclusion.":
    "\u53cd\u5bf9\u610f\u89c1\u4f1a\u4ee5\u672a\u89e3\u51b3\u5206\u6b67\u7684\u5f62\u5f0f\u4fdd\u6301\u53ef\u89c1\uff0c\u5e76\u53ef\u80fd\u4ecd\u7136\u7ea6\u675f\u7ed3\u8bba\u3002",
  "These are challenges, failure modes, or unresolved concerns raised against the current options.":
    "\u8fd9\u4e9b\u662f\u9488\u5bf9\u5f53\u524d\u9009\u9879\u63d0\u51fa\u7684\u6311\u6218\u3001\u5931\u8d25\u6a21\u5f0f\u6216\u672a\u89e3\u51b3\u62c5\u5fe7\u3002",
  "Explicit requirements keep the conclusion correct, bounded, and complete.":
    "\u660e\u786e\u8981\u6c42\u7528\u6765\u4fdd\u6301\u7ed3\u8bba\u6b63\u786e\u3001\u6709\u8fb9\u754c\u4e14\u5b8c\u6574\u3002",
  "Unanswered requirements should be resolved before relying on the conclusion.":
    "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\uff0c\u5e94\u5148\u89e3\u51b3\u5c1a\u672a\u56de\u7b54\u7684\u8981\u6c42\u3002",
  "No requirements listed": "\u5c1a\u672a\u5217\u51fa\u8981\u6c42",
  "Append-only event records are shown as returned by the daemon for debugging and audit inspection.":
    "\u8ffd\u52a0\u5f0f\u4e8b\u4ef6\u8bb0\u5f55\u6309\u5b88\u62a4\u8fdb\u7a0b\u8fd4\u56de\u7684\u5f62\u5f0f\u5c55\u793a\uff0c\u7528\u4e8e\u8c03\u8bd5\u548c\u5ba1\u8ba1\u68c0\u67e5\u3002",
  "Current conclusion compiled": "\u5f53\u524d\u7ed3\u8bba\u5df2\u7f16\u5236",
  "This is reviewable deliberation material. It should keep open disagreements, risks, evidence gaps, and next actions visible.":
    "\u8fd9\u662f\u53ef\u5ba1\u9605\u7684\u5ba1\u8bae\u6750\u6599\u3002\u5b83\u5e94\u6301\u7eed\u5c55\u793a\u672a\u89e3\u51b3\u5206\u6b67\u3001\u98ce\u9669\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u4e0b\u4e00\u6b65\u3002",
  "Missing evidence, verification needs, and risks are shown together so they can be resolved before relying on the conclusion.":
    "\u7f3a\u5931\u8bc1\u636e\u3001\u9a8c\u8bc1\u9700\u6c42\u548c\u98ce\u9669\u4f1a\u4e00\u8d77\u5c55\u793a\uff0c\u4ee5\u4fbf\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\u5148\u89e3\u51b3\u5b83\u4eec\u3002",
  "This page focuses on what still needs to be checked. Technical access details remain in Advanced mode.":
    "\u6b64\u9875\u9762\u805a\u7126\u4ecd\u9700\u68c0\u67e5\u7684\u5185\u5bb9\u3002\u6280\u672f\u8bbf\u95ee\u7ec6\u8282\u4fdd\u7559\u5728\u9ad8\u7ea7\u6a21\u5f0f\u4e2d\u3002",
  "Missing evidence items are user-facing verification work, not low-level access state.":
    "\u7f3a\u5931\u8bc1\u636e\u9879\u662f\u9762\u5411\u7528\u6237\u7684\u9a8c\u8bc1\u5de5\u4f5c\uff0c\u800c\u4e0d\u662f\u5e95\u5c42\u8bbf\u95ee\u72b6\u6001\u3002",
  "This discussion has not surfaced missing evidence items yet.":
    "\u672c\u6b21\u8ba8\u8bba\u5c1a\u672a\u5448\u73b0\u7f3a\u5931\u8bc1\u636e\u9879\u3002",
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
  "Needs attention: one discussion step could not finish cleanly.":
    "\u9700\u8981\u5173\u6ce8\uff1a\u6709\u4e00\u4e2a\u8ba8\u8bba\u6b65\u9aa4\u672a\u80fd\u987a\u5229\u5b8c\u6210\u3002",
  "Discussion step needs attention":
    "\u8ba8\u8bba\u6b65\u9aa4\u9700\u8981\u5173\u6ce8",
  "One guided step could not finish cleanly. Review setup or retry the discussion before relying on a conclusion.":
    "\u6709\u4e00\u4e2a\u5f15\u5bfc\u6b65\u9aa4\u672a\u80fd\u987a\u5229\u5b8c\u6210\u3002\u4f9d\u8d56\u7ed3\u8bba\u524d\uff0c\u8bf7\u68c0\u67e5\u8bbe\u7f6e\u6216\u91cd\u8bd5\u8ba8\u8bba\u3002",
  "Check discussion setup": "\u68c0\u67e5\u8ba8\u8bba\u8bbe\u7f6e",
  "Verify the model setup, then continue the discussion so options, evidence, risks, and conclusion can be rebuilt.":
    "\u8bf7\u9a8c\u8bc1\u6a21\u578b\u8bbe\u7f6e\uff0c\u7136\u540e\u7ee7\u7eed\u8ba8\u8bba\uff0c\u4ee5\u91cd\u5efa\u9009\u9879\u3001\u8bc1\u636e\u3001\u98ce\u9669\u548c\u7ed3\u8bba\u3002",
  "A guided step needs attention. Verify the model setup, then continue the discussion before relying on a conclusion.":
    "\u6709\u4e00\u4e2a\u5f15\u5bfc\u6b65\u9aa4\u9700\u8981\u5173\u6ce8\u3002\u8bf7\u9a8c\u8bc1\u6a21\u578b\u8bbe\u7f6e\uff0c\u7136\u540e\u7ee7\u7eed\u8ba8\u8bba\uff0c\u518d\u4f9d\u8d56\u7ed3\u8bba\u3002",
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
  "Discussion update completed": "\u8ba8\u8bba\u66f4\u65b0\u5df2\u5b8c\u6210",
  "Stronger options requested": "\u5df2\u8981\u6c42\u66f4\u5f3a\u9009\u9879",
  "The discussion stopped before every requested step finished. Review the visible steps below or open Advanced details for the technical reason.":
    "\u8ba8\u8bba\u5728\u6240\u6709\u8bf7\u6c42\u6b65\u9aa4\u5b8c\u6210\u524d\u505c\u6b62\u3002\u8bf7\u67e5\u770b\u4e0b\u65b9\u53ef\u89c1\u6b65\u9aa4\uff0c\u6216\u6253\u5f00\u9ad8\u7ea7\u8be6\u60c5\u67e5\u770b\u6280\u672f\u539f\u56e0\u3002",
  "The guided discussion steps were recorded. Review the updated perspectives, disagreements, requirements, and current conclusion.":
    "\u5df2\u8bb0\u5f55\u5f15\u5bfc\u5f0f\u8ba8\u8bba\u6b65\u9aa4\u3002\u8bf7\u67e5\u770b\u66f4\u65b0\u540e\u7684\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u5f53\u524d\u7ed3\u8bba\u3002",
  "The guided discussion update was recorded. Review the visible steps and continue the discussion before relying on a conclusion.":
    "\u5df2\u8bb0\u5f55\u5f15\u5bfc\u5f0f\u8ba8\u8bba\u66f4\u65b0\u3002\u8bf7\u67e5\u770b\u53ef\u89c1\u6b65\u9aa4\uff0c\u5e76\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\u7ee7\u7eed\u63a8\u8fdb\u8ba8\u8bba\u3002",
  "The guided update ran with the current brief. Review the updated conclusion, disagreements, requirements, and evidence before relying on it.":
    "\u5df2\u57fa\u4e8e\u5f53\u524d\u7b80\u62a5\u8fd0\u884c\u5f15\u5bfc\u5f0f\u66f4\u65b0\u3002\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\uff0c\u8bf7\u5ba1\u9605\u66f4\u65b0\u540e\u7684\u7ed3\u8bba\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u3002",
  "The guided update ran so the strongest current options can be compared again before relying on the conclusion.":
    "\u5df2\u8fd0\u884c\u5f15\u5bfc\u5f0f\u66f4\u65b0\uff0c\u4ee5\u4fbf\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\u518d\u6b21\u6bd4\u8f83\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002",
  "Stop reason": "\u505c\u6b62\u539f\u56e0",
  "A first-response participant still needs to finish. Review visible progress, then try Continue discussion again.":
    "\u4ecd\u6709\u4e00\u4e2a\u521d\u59cb\u56de\u5e94\u53c2\u4e0e\u8005\u9700\u8981\u5b8c\u6210\u3002\u8bf7\u67e5\u770b\u53ef\u89c1\u8fdb\u5ea6\uff0c\u7136\u540e\u518d\u6b21\u5c1d\u8bd5\u201c\u7ee7\u7eed\u8ba8\u8bba\u201d\u3002",
  "Independent first responses are ready but not revealed yet. Try Continue discussion again to reveal them before reviewing options.":
    "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u5df2\u51c6\u5907\u597d\uff0c\u4f46\u5c1a\u672a\u63ed\u793a\u3002\u8bf7\u518d\u6b21\u5c1d\u8bd5\u201c\u7ee7\u7eed\u8ba8\u8bba\u201d\uff0c\u518d\u5ba1\u9605\u9009\u9879\u3002",
  "A guided step is still waiting on model work. Review visible progress or try again after checking setup.":
    "\u6709\u4e00\u4e2a\u5f15\u5bfc\u6b65\u9aa4\u4ecd\u5728\u7b49\u5f85\u6a21\u578b\u5de5\u4f5c\u3002\u8bf7\u67e5\u770b\u53ef\u89c1\u8fdb\u5c55\uff0c\u6216\u68c0\u67e5\u8bbe\u7f6e\u540e\u91cd\u8bd5\u3002",
  "A guided step needs attention before Deliberum can continue the full discussion.":
    "\u6709\u4e00\u4e2a\u5f15\u5bfc\u6b65\u9aa4\u9700\u8981\u5904\u7406\uff0cDeliberum \u624d\u80fd\u7ee7\u7eed\u5b8c\u6574\u8ba8\u8bba\u3002",
  "The discussion paused before every requested step finished. Open Advanced details for the technical reason.":
    "\u8ba8\u8bba\u5728\u6240\u6709\u8bf7\u6c42\u6b65\u9aa4\u5b8c\u6210\u524d\u5df2\u6682\u505c\u3002\u8bf7\u6253\u5f00\u9ad8\u7ea7\u8be6\u60c5\u67e5\u770b\u6280\u672f\u539f\u56e0\u3002",
  "A model or review step could not finish safely. Check model setup, then try Continue discussion again. If the same discussion keeps failing after partial responses, start a new model-backed discussion.":
    "\u6709\u4e00\u4e2a\u6a21\u578b\u6216\u5ba1\u67e5\u6b65\u9aa4\u672a\u80fd\u5b89\u5168\u5b8c\u6210\u3002\u8bf7\u5148\u68c0\u67e5\u6a21\u578b\u8bbe\u7f6e\uff0c\u7136\u540e\u518d\u5c1d\u8bd5\u201c\u7ee7\u7eed\u8ba8\u8bba\u201d\u3002\u5982\u679c\u540c\u4e00\u8ba8\u8bba\u5728\u90e8\u5206\u56de\u5e94\u540e\u6301\u7eed\u5931\u8d25\uff0c\u8bf7\u5f00\u59cb\u4e00\u4e2a\u65b0\u7684\u6a21\u578b\u652f\u6301\u8ba8\u8bba\u3002",
  "Discussion recovery options": "\u8ba8\u8bba\u6062\u590d\u9009\u9879",
  "Recovery options": "\u6062\u590d\u9009\u9879",
  "Keep the discussion recoverable": "\u4fdd\u6301\u8ba8\u8bba\u53ef\u6062\u590d",
  "Use these steps when a provider returns only part of the discussion or a review step fails before Deliberum can rebuild the conclusion.":
    "\u5f53\u63d0\u4f9b\u65b9\u53ea\u8fd4\u56de\u90e8\u5206\u8ba8\u8bba\u5185\u5bb9\uff0c\u6216\u5ba1\u67e5\u6b65\u9aa4\u5728 Deliberum \u91cd\u5efa\u7ed3\u8bba\u524d\u5931\u8d25\u65f6\uff0c\u8bf7\u6309\u8fd9\u4e9b\u6b65\u9aa4\u5904\u7406\u3002",
  "Check model setup": "\u68c0\u67e5\u6a21\u578b\u8bbe\u7f6e",
  "Verify the provider connection and structured review compatibility.":
    "\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u8fde\u63a5\u548c\u7ed3\u6784\u5316\u5ba1\u8bae\u517c\u5bb9\u6027\u3002",
  "Try Continue discussion again": "\u518d\u6b21\u5c1d\u8bd5\u7ee7\u7eed\u8ba8\u8bba",
  "Retry the current discussion after setup is confirmed.":
    "\u786e\u8ba4\u8bbe\u7f6e\u540e\uff0c\u91cd\u8bd5\u5f53\u524d\u8ba8\u8bba\u3002",
  "If it repeats": "\u5982\u679c\u91cd\u590d\u51fa\u73b0",
  "Start a new model-backed discussion": "\u5f00\u59cb\u65b0\u7684\u6a21\u578b\u652f\u6301\u8ba8\u8bba",
  "Use a fresh discussion when partial provider results keep blocking review.":
    "\u5f53\u63d0\u4f9b\u65b9\u7684\u90e8\u5206\u7ed3\u679c\u6301\u7eed\u963b\u585e\u5ba1\u67e5\u65f6\uff0c\u8bf7\u4f7f\u7528\u65b0\u8ba8\u8bba\u3002",
  "No visible discussion steps": "\u6ca1\u6709\u53ef\u89c1\u8ba8\u8bba\u6b65\u9aa4",
  "No user-facing step updates were returned for this request.":
    "\u672c\u6b21\u8bf7\u6c42\u6ca1\u6709\u8fd4\u56de\u9762\u5411\u7528\u6237\u7684\u6b65\u9aa4\u66f4\u65b0\u3002",
  "Latest discussion update": "\u6700\u65b0\u8ba8\u8bba\u66f4\u65b0",
  "Room update": "\u8ba8\u8bba\u5ba4\u66f4\u65b0",
  "The room just updated": "\u8ba8\u8bba\u5ba4\u521a\u521a\u66f4\u65b0",
  "Review this result first, then return to the timeline, outputs, or current conclusion.":
    "\u8bf7\u5148\u5ba1\u9605\u6b64\u7ed3\u679c\uff0c\u7136\u540e\u56de\u5230\u65f6\u95f4\u7ebf\u3001\u8ba8\u8bba\u4ea7\u51fa\u6216\u5f53\u524d\u7ed3\u8bba\u3002",
  "Review this result first, then return to the timeline, outputs, or next recommended action.":
    "\u8bf7\u5148\u5ba1\u9605\u6b64\u7ed3\u679c\uff0c\u7136\u540e\u56de\u5230\u65f6\u95f4\u7ebf\u3001\u8ba8\u8bba\u4ea7\u51fa\u6216\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
  "Review this room update, then return to the timeline, outputs, or next recommended action.":
    "\u8bf7\u5148\u5ba1\u9605\u6b64\u8ba8\u8bba\u5ba4\u66f4\u65b0\uff0c\u7136\u540e\u56de\u5230\u65f6\u95f4\u7ebf\u3001\u8ba8\u8bba\u4ea7\u51fa\u6216\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
  "Updated discussion steps": "\u5df2\u66f4\u65b0\u7684\u8ba8\u8bba\u6b65\u9aa4",
  "Room progress": "\u8ba8\u8bba\u5ba4\u8fdb\u5c55",
  "What the room did": "\u8ba8\u8bba\u5ba4\u521a\u521a\u505a\u4e86\u4ec0\u4e48",
  "What changed": "\u53d1\u751f\u4e86\u4ec0\u4e48\u53d8\u5316",
  "Readable summary of the discussion work that just ran.":
    "\u521a\u521a\u8fd0\u884c\u7684\u8ba8\u8bba\u5de5\u4f5c\u7684\u53ef\u8bfb\u6458\u8981\u3002",
  "Each line is a discussion step that just changed.":
    "\u6bcf\u4e00\u884c\u90fd\u662f\u521a\u521a\u53d8\u66f4\u7684\u8ba8\u8bba\u6b65\u9aa4\u3002",
  "Post-update review path": "\u66f4\u65b0\u540e\u5ba1\u9605\u8def\u5f84",
  "Room handoff": "\u8ba8\u8bba\u5ba4\u63a5\u529b",
  "Back to the room": "\u56de\u5230\u8ba8\u8bba\u5ba4",
  "What to review next": "\u63a5\u4e0b\u6765\u5ba1\u9605\u4ec0\u4e48",
  "Use these links to return from the completed action to the room view.":
    "\u7528\u8fd9\u4e9b\u94fe\u63a5\u4ece\u5df2\u5b8c\u6210\u7684\u52a8\u4f5c\u56de\u5230\u8ba8\u8bba\u5ba4\u89c6\u56fe\u3002",
  "Use these room links to review what changed without leaving the discussion flow.":
    "\u4f7f\u7528\u8fd9\u4e9b\u8ba8\u8bba\u5ba4\u94fe\u63a5\u5ba1\u9605\u521a\u521a\u53d8\u66f4\u7684\u5185\u5bb9\uff0c\u4e0d\u7528\u79bb\u5f00\u8ba8\u8bba\u6d41\u3002",
  First: "\u9996\u5148",
  Finally: "\u6700\u540e",
  Next: "\u4e0b\u4e00\u6b65",
  "Review updated timeline": "\u5ba1\u9605\u66f4\u65b0\u540e\u7684\u65f6\u95f4\u7ebf",
  "See where the new steps landed in the discussion flow.":
    "\u67e5\u770b\u65b0\u6b65\u9aa4\u5728\u8ba8\u8bba\u6d41\u7a0b\u4e2d\u843d\u5728\u4ec0\u4e48\u4f4d\u7f6e\u3002",
  "Review discussion outputs": "\u5ba1\u9605\u8ba8\u8bba\u4ea7\u51fa",
  "Compare strongest options, open disagreements, requirements, and missing evidence.":
    "\u6bd4\u8f83\u6700\u5f3a\u9009\u9879\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u8981\u6c42\u548c\u7f3a\u5931\u8bc1\u636e\u3002",
  "Review the conclusion with risks and next actions.":
    "\u5c06\u7ed3\u8bba\u4e0e\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u4e00\u8d77\u5ba1\u9605\u3002",
  "Current conclusion appears after the room produces conclusion material.":
    "\u8ba8\u8bba\u5ba4\u751f\u6210\u7ed3\u8bba\u6750\u6599\u540e\uff0c\u5f53\u524d\u7ed3\u8bba\u624d\u4f1a\u663e\u793a\u3002",
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
  "In progress": "\u8fdb\u884c\u4e2d",
  "This discussion step is still being processed.":
    "\u6b64\u8ba8\u8bba\u6b65\u9aa4\u4ecd\u5728\u5904\u7406\u4e2d\u3002",
  Failed: "\u5931\u8d25",
  "This discussion step could not be processed safely.": "\u6b64\u8ba8\u8bba\u6b65\u9aa4\u65e0\u6cd5\u88ab\u5b89\u5168\u5904\u7406\u3002",
  "Needs attention": "\u9700\u8981\u5173\u6ce8",
  "This discussion step needs attention before the conclusion can be trusted.":
    "\u5728\u7ed3\u8bba\u53ef\u4fe1\u4e4b\u524d\uff0c\u6b64\u8ba8\u8bba\u6b65\u9aa4\u9700\u8981\u5148\u88ab\u5904\u7406\u3002",
  "This discussion step returned a status that needs developer review.":
    "\u6b64\u8ba8\u8bba\u6b65\u9aa4\u8fd4\u56de\u4e86\u9700\u8981\u5f00\u53d1\u8005\u68c0\u67e5\u7684\u72b6\u6001\u3002",
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
  "Update conclusion": "\u66f4\u65b0\u7ed3\u8bba",
  "Run the guided update again after reviewing disagreements, evidence gaps, and requirements.":
    "\u5728\u5ba1\u9605\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u8981\u6c42\u540e\uff0c\u518d\u6b21\u8fd0\u884c\u5f15\u5bfc\u5f0f\u66f4\u65b0\u3002",
  "Continue the guided discussion so perspectives, disagreements, requirements, evidence and verification, risk review, and conclusion can appear.":
    "\u7ee7\u7eed\u5f15\u5bfc\u5f0f\u8ba8\u8bba\uff0c\u4ee5\u5448\u73b0\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u4e0e\u6838\u67e5\u3001\u98ce\u9669\u5ba1\u67e5\u548c\u7ed3\u8bba\u3002",
  "Continue the full guided discussion": "\u7ee7\u7eed\u5b8c\u6574\u5f15\u5bfc\u5f0f\u8ba8\u8bba",
  "Collects independent first responses, organizes main perspectives, reviews requirements, checks evidence needs, and compiles a provisional conclusion.":
    "\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\uff0c\u6574\u7406\u4e3b\u8981\u89c2\u70b9\uff0c\u5ba1\u9605\u8981\u6c42\uff0c\u68c0\u67e5\u8bc1\u636e\u9700\u6c42\uff0c\u5e76\u7f16\u5236\u4e34\u65f6\u7ed3\u8bba\u3002",
  "Collect perspectives, organize strongest options, check evidence needs, and draft a conclusion.":
    "\u6536\u96c6\u89c6\u89d2\u3001\u6574\u7406\u6700\u5f3a\u9009\u9879\u3001\u68c0\u67e5\u8bc1\u636e\u9700\u6c42\u5e76\u8d77\u8349\u7ed3\u8bba\u3002",
  "Recommended action path": "\u63a8\u8350\u64cd\u4f5c\u8def\u5f84",
  "Recommended path": "\u63a8\u8350\u8def\u5f84",
  "Follow these steps so the discussion keeps moving in user terms.":
    "\u6309\u8fd9\u4e9b\u6b65\u9aa4\u63a8\u8fdb\uff0c\u8ba8\u8bba\u4f1a\u59cb\u7ec8\u4ee5\u7528\u6237\u80fd\u7406\u89e3\u7684\u65b9\u5f0f\u7ee7\u7eed\u3002",
  "Start here": "\u4ece\u8fd9\u91cc\u5f00\u59cb",
  Then: "\u7136\u540e",
  "After that": "\u4e4b\u540e",
  "Start with the conclusion before changing the room.":
    "\u5728\u6539\u53d8\u8ba8\u8bba\u5ba4\u4e4b\u524d\uff0c\u5148\u67e5\u770b\u5f53\u524d\u7ed3\u8bba\u3002",
  "Choose a follow-up action": "\u9009\u62e9\u8ddf\u8fdb\u52a8\u4f5c",
  "Update the conclusion or ask for stronger options after checking disagreements, requirements, and evidence.":
    "\u68c0\u67e5\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u540e\uff0c\u518d\u66f4\u65b0\u7ed3\u8bba\u6216\u8981\u6c42\u66f4\u5f3a\u9009\u9879\u3002",
  "Recheck the room outputs": "\u91cd\u65b0\u68c0\u67e5\u8ba8\u8bba\u4ea7\u51fa",
  "Return to strongest options, open disagreements, missing evidence, risks, and next actions.":
    "\u56de\u5230\u6700\u5f3a\u9009\u9879\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u7f3a\u5931\u8bc1\u636e\u3001\u98ce\u9669\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u3002",
  "Collect independent perspectives, strongest options, disagreements, evidence checks, risks, and a draft conclusion.":
    "\u6536\u96c6\u72ec\u7acb\u89c6\u89d2\u3001\u6700\u5f3a\u9009\u9879\u3001\u5206\u6b67\u3001\u8bc1\u636e\u6838\u67e5\u3001\u98ce\u9669\u548c\u7ed3\u8bba\u8349\u7a3f\u3002",
  "Review what changed": "\u67e5\u770b\u53d8\u5316",
  "Use the room timeline and discussion outputs to see what each participant contributed.":
    "\u4f7f\u7528\u8ba8\u8bba\u5ba4\u65f6\u95f4\u7ebf\u548c\u8ba8\u8bba\u4ea7\u51fa\u67e5\u770b\u6bcf\u4e2a\u53c2\u4e0e\u8005\u8d21\u732e\u4e86\u4ec0\u4e48\u3002",
  "Open current conclusion": "\u6253\u5f00\u5f53\u524d\u7ed3\u8bba",
  "When ready, review the conclusion together with risks, missing evidence, and next actions.":
    "\u51c6\u5907\u597d\u540e\uff0c\u5c06\u7ed3\u8bba\u4e0e\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u4e00\u8d77\u5ba1\u9605\u3002",
  Recommended: "\u63a8\u8350",
  "Discussion actions": "\u8ba8\u8bba\u52a8\u4f5c",
  "Discussion action composer": "\u8ba8\u8bba\u64cd\u4f5c\u7f16\u8f91\u533a",
  "Ask for stronger options": "\u8981\u6c42\u66f4\u5f3a\u9009\u9879",
  "Refresh the discussion so the strongest current options can be compared and improved.":
    "\u5237\u65b0\u8ba8\u8bba\uff0c\u4ee5\u6bd4\u8f83\u5e76\u6539\u8fdb\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002",
  "Review disagreements": "\u5ba1\u9605\u5206\u6b67",
  "Jump to unresolved objections that still constrain the conclusion.":
    "\u8df3\u5230\u4ecd\u7136\u7ea6\u675f\u7ed3\u8bba\u7684\u672a\u89e3\u51b3\u53cd\u5bf9\u610f\u89c1\u3002",
  "Review requirements that must be satisfied or acknowledged before relying on the conclusion.":
    "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\uff0c\u8bf7\u5ba1\u9605\u5fc5\u987b\u6ee1\u8db3\u6216\u660e\u786e\u8bf4\u660e\u7684\u8981\u6c42\u3002",
  "Check evidence": "\u68c0\u67e5\u8bc1\u636e",
  "Review missing or unchecked evidence before relying on the answer.":
    "\u5728\u4f9d\u8d56\u7b54\u6848\u524d\u5ba1\u9605\u7f3a\u5931\u6216\u672a\u6838\u67e5\u7684\u8bc1\u636e\u3002",
  "Review actions unlock later": "\u5ba1\u9605\u52a8\u4f5c\u7a0d\u540e\u89e3\u9501",
  "Available after first update": "\u9996\u6b21\u66f4\u65b0\u540e\u53ef\u7528",
  "After the room has perspectives, disagreements, evidence gaps, risks, and a draft conclusion, review actions will appear here.":
    "\u5f53\u8ba8\u8bba\u5ba4\u5df2\u6709\u89c2\u70b9\u3001\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u3001\u98ce\u9669\u548c\u7ed3\u8bba\u8349\u7a3f\u540e\uff0c\u5ba1\u9605\u52a8\u4f5c\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
  "For now, continue the discussion to create those materials.":
    "\u73b0\u5728\u8bf7\u5148\u7ee7\u7eed\u8ba8\u8bba\uff0c\u521b\u5efa\u8fd9\u4e9b\u6750\u6599\u3002",
  "Participant first responses": "\u53c2\u4e0e\u8005\u521d\u59cb\u56de\u5e94",
  "What participants said first": "\u53c2\u4e0e\u8005\u6700\u521d\u8bf4\u4e86\u4ec0\u4e48",
  "These are the separate first responses before the room organized options, disagreements, and evidence needs.":
    "\u8fd9\u4e9b\u662f\u8ba8\u8bba\u5ba4\u6574\u7406\u9009\u9879\u3001\u5206\u6b67\u548c\u8bc1\u636e\u9700\u6c42\u4e4b\u524d\u7684\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002",
  "Independent response": "\u72ec\u7acb\u56de\u5e94",
  "Room activity": "\u8ba8\u8bba\u5ba4\u6d3b\u52a8",
  "Conversation transcript": "\u5bf9\u8bdd\u8bb0\u5f55",
  "What the room said and did": "\u8ba8\u8bba\u5ba4\u8bf4\u4e86\u4ec0\u4e48\u3001\u505a\u4e86\u4ec0\u4e48",
  "Participant messages and room updates appear in order.":
    "\u53c2\u4e0e\u8005\u53d1\u8a00\u548c\u8ba8\u8bba\u5ba4\u66f4\u65b0\u4f1a\u6309\u987a\u5e8f\u663e\u793a\u3002",
  "Discussion phase": "\u8ba8\u8bba\u9636\u6bb5",
  "Discussion update": "\u8ba8\u8bba\u66f4\u65b0",
  "Readable discussion flow": "\u53ef\u8bfb\u8ba8\u8bba\u6d41\u7a0b",
  "Discussion brief updates": "\u8ba8\u8bba\u7b80\u62a5\u66f4\u65b0",
  "The room starts by making the question, goals, and constraints visible.":
    "\u8ba8\u8bba\u5ba4\u4f1a\u5148\u8ba9\u95ee\u9898\u3001\u76ee\u6807\u548c\u7ea6\u675f\u4fdd\u6301\u53ef\u89c1\u3002",
  "Independent first response updates": "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u66f4\u65b0",
  "Participants respond separately before comparing answers.":
    "\u53c2\u4e0e\u8005\u4f1a\u5148\u5206\u522b\u56de\u5e94\uff0c\u7136\u540e\u518d\u6bd4\u8f83\u7b54\u6848\u3002",
  "Main perspectives and disagreements": "\u4e3b\u8981\u89c2\u70b9\u4e0e\u5206\u6b67",
  "The room organizes strongest options and keeps challenges visible.":
    "\u8ba8\u8bba\u5ba4\u4f1a\u6574\u7406\u6700\u5f3a\u9009\u9879\uff0c\u5e76\u4fdd\u6301\u6311\u6218\u610f\u89c1\u53ef\u89c1\u3002",
  "Main perspective and disagreement updates": "\u4e3b\u8981\u89c2\u70b9\u4e0e\u5206\u6b67\u66f4\u65b0",
  "Evidence and verification updates": "\u8bc1\u636e\u4e0e\u6838\u67e5\u66f4\u65b0",
  "Evidence checks and missing information are kept visible before relying on a conclusion.":
    "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\uff0c\u8bc1\u636e\u6838\u67e5\u548c\u7f3a\u5931\u4fe1\u606f\u4f1a\u4fdd\u6301\u53ef\u89c1\u3002",
  "Current conclusion and risk review": "\u5f53\u524d\u7ed3\u8bba\u4e0e\u98ce\u9669\u5ba1\u67e5",
  "The room drafts a conclusion and records risks or boundaries for review.":
    "\u8ba8\u8bba\u5ba4\u4f1a\u8d77\u8349\u7ed3\u8bba\uff0c\u5e76\u8bb0\u5f55\u98ce\u9669\u6216\u8fb9\u754c\u4ee5\u4f9b\u5ba1\u67e5\u3002",
  "Current conclusion and risk review updates": "\u5f53\u524d\u7ed3\u8bba\u4e0e\u98ce\u9669\u5ba1\u67e5\u66f4\u65b0",
  "Room progress summary": "\u8ba8\u8bba\u5ba4\u8fdb\u5ea6\u6458\u8981",
  "Current phase": "\u5f53\u524d\u9636\u6bb5",
  "Current conclusion ready": "\u5f53\u524d\u7ed3\u8bba\u53ef\u5ba1\u9605",
  "The room has a reviewable conclusion. Check open disagreements, requirements, evidence gaps, and risks before relying on it.":
    "\u8ba8\u8bba\u5ba4\u5df2\u6709\u53ef\u5ba1\u9605\u7684\u7ed3\u8bba\u3002\u5728\u4f9d\u8d56\u5b83\u4e4b\u524d\uff0c\u8bf7\u68c0\u67e5\u672a\u89e3\u51b3\u5206\u6b67\u3001\u8981\u6c42\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u98ce\u9669\u3002",
  "Comparing strongest options": "\u6b63\u5728\u6bd4\u8f83\u6700\u5f3a\u9009\u9879",
  "Strongest options are visible. Review disagreements, requirements, and evidence gaps before updating the conclusion.":
    "\u6700\u5f3a\u9009\u9879\u5df2\u53ef\u89c1\u3002\u66f4\u65b0\u7ed3\u8bba\u524d\uff0c\u8bf7\u5ba1\u9605\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u7f3a\u53e3\u3002",
  "Reviewing independent first responses": "\u6b63\u5728\u5ba1\u9605\u72ec\u7acb\u521d\u59cb\u56de\u5e94",
  "Independent first responses are visible before the room converges on strongest current options.":
    "\u5728\u8ba8\u8bba\u5ba4\u6536\u655b\u5230\u5f53\u524d\u6700\u5f3a\u9009\u9879\u524d\uff0c\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u5df2\u53ef\u89c1\u3002",
  "Collecting first perspectives": "\u6b63\u5728\u6536\u96c6\u7b2c\u4e00\u8f6e\u89c6\u89d2",
  "The discussion brief is ready. Continue the discussion to collect independent first responses.":
    "\u8ba8\u8bba\u7b80\u62a5\u5df2\u5c31\u7eea\u3002\u7ee7\u7eed\u8ba8\u8bba\u4ee5\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002",
  "Next checkpoint": "\u4e0b\u4e00\u4e2a\u68c0\u67e5\u70b9",
  "Review current conclusion with open items visible.":
    "\u5728\u672a\u89e3\u51b3\u9879\u4fdd\u6301\u53ef\u89c1\u7684\u60c5\u51b5\u4e0b\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba\u3002",
  "Open the current conclusion and confirm it matches the discussion brief.":
    "\u6253\u5f00\u5f53\u524d\u7ed3\u8bba\uff0c\u5e76\u786e\u8ba4\u5b83\u4e0e\u8ba8\u8bba\u7b80\u62a5\u4e00\u81f4\u3002",
  "Update the conclusion after reviewing the visible open items.":
    "\u5ba1\u9605\u53ef\u89c1\u672a\u89e3\u51b3\u9879\u540e\uff0c\u66f4\u65b0\u7ed3\u8bba\u3002",
  "Update the discussion so the room can draft a current conclusion.":
    "\u66f4\u65b0\u8ba8\u8bba\uff0c\u8ba9\u8ba8\u8bba\u5ba4\u8d77\u8349\u5f53\u524d\u7ed3\u8bba\u3002",
  "Organize strongest options": "\u6574\u7406\u6700\u5f3a\u9009\u9879",
  "Continue the discussion so the room can organize perspectives, disagreements, and evidence needs.":
    "\u7ee7\u7eed\u8ba8\u8bba\uff0c\u8ba9\u8ba8\u8bba\u5ba4\u6574\u7406\u89c6\u89d2\u3001\u5206\u6b67\u548c\u8bc1\u636e\u9700\u6c42\u3002",
  "Collect independent first responses": "\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94",
  "Continue the discussion before comparing options or reviewing a conclusion.":
    "\u5728\u6bd4\u8f83\u9009\u9879\u6216\u5ba1\u9605\u7ed3\u8bba\u4e4b\u524d\uff0c\u8bf7\u5148\u7ee7\u7eed\u8ba8\u8bba\u3002",
  "Review before relying": "\u4f9d\u8d56\u524d\u9700\u5ba1\u9605",
  "Loading room activity": "\u6b63\u5728\u52a0\u8f7d\u8ba8\u8bba\u5ba4\u6d3b\u52a8",
  "Could not load room activity": "\u65e0\u6cd5\u52a0\u8f7d\u8ba8\u8bba\u5ba4\u6d3b\u52a8",
  "No room activity visible yet": "\u5c1a\u65e0\u53ef\u89c1\u8ba8\u8bba\u5ba4\u6d3b\u52a8",
  "Continue the discussion so the room can show participant responses and discussion updates.":
    "\u7ee7\u7eed\u8ba8\u8bba\u540e\uff0c\u8ba8\u8bba\u5ba4\u4f1a\u663e\u793a\u53c2\u4e0e\u8005\u56de\u5e94\u548c\u8ba8\u8bba\u66f4\u65b0\u3002",
  "Room progress and stages": "\u8ba8\u8bba\u8fdb\u5ea6\u4e0e\u9636\u6bb5",
  "Current phase, first responses, and stage checklist":
    "\u5f53\u524d\u9636\u6bb5\u3001\u9996\u8f6e\u56de\u5e94\u548c\u9636\u6bb5\u6e05\u5355",
  "Core discussion stages": "\u6838\u5fc3\u8ba8\u8bba\u9636\u6bb5",
  "Structured deliberation progress": "\u7ed3\u6784\u5316\u5ba1\u8bae\u8fdb\u5ea6",
  "Discussion brief published": "\u8ba8\u8bba\u7b80\u62a5\u5df2\u53d1\u5e03",
  "Shared the discussion brief": "\u5206\u4eab\u4e86\u8ba8\u8bba\u7b80\u62a5",
  "The discussion brief is available for everyone in the room.":
    "\u8ba8\u8bba\u5ba4\u4e2d\u7684\u6240\u6709\u4eba\u90fd\u53ef\u4ee5\u67e5\u770b\u8ba8\u8bba\u7b80\u62a5\u3002",
  "Independent first responses opened": "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u5df2\u5f00\u542f",
  "Opened independent first responses": "\u5f00\u542f\u4e86\u72ec\u7acb\u521d\u59cb\u56de\u5e94",
  "Participants can respond separately before seeing one another's answers.":
    "\u53c2\u4e0e\u8005\u53ef\u4ee5\u5148\u5206\u522b\u56de\u5e94\uff0c\u518d\u770b\u5230\u5f7c\u6b64\u7b54\u6848\u3002",
  "Independent response submitted": "\u72ec\u7acb\u56de\u5e94\u5df2\u63d0\u4ea4",
  "Submitted a sealed first response": "\u63d0\u4ea4\u4e86\u5c01\u5b58\u7684\u521d\u59cb\u56de\u5e94",
  "Shared a first response": "\u5206\u4eab\u4e86\u521d\u59cb\u56de\u5e94",
  "This response is sealed until the independent first responses are revealed.":
    "\u5728\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u63ed\u793a\u524d\uff0c\u6b64\u56de\u5e94\u4fdd\u6301\u5c01\u5b58\u3002",
  "Independent first responses revealed": "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u5df2\u63ed\u793a",
  "Made first responses visible": "\u5c06\u521d\u59cb\u56de\u5e94\u8bbe\u4e3a\u53ef\u89c1",
  "The independent responses are now available for review.":
    "\u72ec\u7acb\u56de\u5e94\u73b0\u5728\u53ef\u4f9b\u5ba1\u9605\u3002",
  "Main perspectives organized": "\u4e3b\u8981\u89c2\u70b9\u5df2\u6574\u7406",
  "Organized the strongest options": "\u6574\u7406\u4e86\u6700\u5f3a\u9009\u9879",
  "The revealed responses were organized into options, disagreements, requirements, and evidence needs.":
    "\u5df2\u63ed\u793a\u56de\u5e94\u88ab\u6574\u7406\u4e3a\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002",
  "Discussion material accepted for review": "\u8ba8\u8bba\u6750\u6599\u5df2\u63a5\u53d7\u5ba1\u9605",
  "Kept this material in the room": "\u5c06\u8fd9\u4efd\u6750\u6599\u7559\u5728\u8ba8\u8bba\u5ba4\u4e2d",
  "The room accepted this discussion material as part of the current working view.":
    "\u8ba8\u8bba\u5ba4\u5df2\u5c06\u8fd9\u4efd\u8ba8\u8bba\u6750\u6599\u7eb3\u5165\u5f53\u524d\u5de5\u4f5c\u89c6\u56fe\u3002",
  "Open disagreement recorded": "\u672a\u89e3\u51b3\u5206\u6b67\u5df2\u8bb0\u5f55",
  "Raised an open disagreement": "\u63d0\u51fa\u4e86\u672a\u89e3\u51b3\u5206\u6b67",
  "A challenge was recorded against the current discussion material.":
    "\u5df2\u9488\u5bf9\u5f53\u524d\u8ba8\u8bba\u6750\u6599\u8bb0\u5f55\u4e00\u6761\u6311\u6218\u3002",
  "Evidence check recorded": "\u8bc1\u636e\u6838\u67e5\u5df2\u8bb0\u5f55",
  "Checked evidence": "\u6838\u67e5\u4e86\u8bc1\u636e",
  "An evidence check result was added to the discussion.":
    "\u4e00\u6761\u8bc1\u636e\u6838\u67e5\u7ed3\u679c\u5df2\u52a0\u5165\u8ba8\u8bba\u3002",
  "Current conclusion drafted": "\u5f53\u524d\u7ed3\u8bba\u5df2\u8d77\u8349",
  "Drafted the current conclusion": "\u8d77\u8349\u4e86\u5f53\u524d\u7ed3\u8bba",
  "A reviewable conclusion draft was prepared from the current discussion material.":
    "\u5df2\u6839\u636e\u5f53\u524d\u8ba8\u8bba\u6750\u6599\u51c6\u5907\u53ef\u5ba1\u9605\u7684\u7ed3\u8bba\u8349\u7a3f\u3002",
  "Risk review recorded": "\u98ce\u9669\u5ba1\u67e5\u5df2\u8bb0\u5f55",
  "Reviewed risks": "\u5ba1\u9605\u4e86\u98ce\u9669",
  "A risk review was recorded for the current conclusion.":
    "\u5df2\u4e3a\u5f53\u524d\u7ed3\u8bba\u8bb0\u5f55\u4e00\u6761\u98ce\u9669\u5ba1\u67e5\u3002",
  "This participant response is available for review in the room.":
    "\u6b64\u53c2\u4e0e\u8005\u56de\u5e94\u53ef\u5728\u8ba8\u8bba\u5ba4\u4e2d\u5ba1\u9605\u3002",
  "Guided sample discussion":
    "\u5f15\u5bfc\u5f0f\u793a\u4f8b\u8ba8\u8bba",
  "How should we review a proposed rollout before relying on it?":
    "\u6211\u4eec\u5e94\u5982\u4f55\u5728\u4f9d\u8d56\u62df\u8bae\u53d1\u5e03\u524d\u5ba1\u67e5\u5b83\uff1f",
  "Compare the strongest current options.":
    "\u6bd4\u8f83\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002",
  "Keep unresolved disagreements and missing evidence visible.":
    "\u4fdd\u6301\u672a\u89e3\u51b3\u5206\u6b67\u548c\u7f3a\u5931\u8bc1\u636e\u53ef\u89c1\u3002",
  "Keep open disagreements and missing evidence visible.":
    "\u4fdd\u6301\u672a\u89e3\u51b3\u5206\u6b67\u548c\u7f3a\u5931\u8bc1\u636e\u53ef\u89c1\u3002",
  "Use configured model-backed participants from the local service.":
    "\u4f7f\u7528\u672c\u5730\u670d\u52a1\u4e2d\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u652f\u6301\u53c2\u4e0e\u8005\u3002",
  "Use two independent model-backed perspectives from the local service.":
    "\u4f7f\u7528\u672c\u5730\u670d\u52a1\u4e2d\u7684\u4e24\u4e2a\u72ec\u7acb\u6a21\u578b\u89c6\u89d2\u3002",
  "Use three independent model-backed perspectives from the local service.":
    "\u4f7f\u7528\u672c\u5730\u670d\u52a1\u4e2d\u7684\u4e09\u4e2a\u72ec\u7acb\u6a21\u578b\u89c6\u89d2\u3002",
  "Keep provider credentials saved locally and out of the discussion.":
    "\u5c06\u63d0\u4f9b\u65b9\u51ed\u636e\u4fdd\u5b58\u5728\u672c\u5730\uff0c\u4e0d\u5199\u5165\u8ba8\u8bba\u5185\u5bb9\u3002",
  "Keep the walkthrough deterministic and reviewable.":
    "\u4fdd\u6301\u6f14\u793a\u53ef\u590d\u73b0\u4e14\u53ef\u5ba1\u9605\u3002",
  "Treat the conclusion as provisional until a human reviews it.":
    "\u5728\u4eba\u7c7b\u5ba1\u9605\u524d\uff0c\u5c06\u7ed3\u8bba\u89c6\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002",
  "Show the current conclusion.":
    "\u5c55\u793a\u5f53\u524d\u7ed3\u8bba\u3002",
  "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions.":
    "\u5217\u51fa\u4e3b\u8981\u89c2\u70b9\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
  "{count} readable perspective is visible in the room.":
    "\u8ba8\u8bba\u5ba4\u4e2d\u6709 {count} \u4e2a\u53ef\u8bfb\u89c6\u89d2\u3002",
  "{count} readable perspectives are visible in the room.":
    "\u8ba8\u8bba\u5ba4\u4e2d\u6709 {count} \u4e2a\u53ef\u8bfb\u89c6\u89d2\u3002",
  "{disagreements} open disagreement and {evidence} evidence gap are visible.":
    "\u6709 {disagreements} \u4e2a\u672a\u89e3\u51b3\u5206\u6b67\u548c {evidence} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u53ef\u89c1\u3002",
  "{disagreements} open disagreement and {evidence} evidence gaps are visible.":
    "\u6709 {disagreements} \u4e2a\u672a\u89e3\u51b3\u5206\u6b67\u548c {evidence} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u53ef\u89c1\u3002",
  "{disagreements} open disagreements and {evidence} evidence gap are visible.":
    "\u6709 {disagreements} \u4e2a\u672a\u89e3\u51b3\u5206\u6b67\u548c {evidence} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u53ef\u89c1\u3002",
  "{disagreements} open disagreements and {evidence} evidence gaps are visible.":
    "\u6709 {disagreements} \u4e2a\u672a\u89e3\u51b3\u5206\u6b67\u548c {evidence} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u53ef\u89c1\u3002",
  "Review a proposed rollout before relying on it.":
    "\u5728\u4f9d\u8d56\u62df\u8bae\u53d1\u5e03\u524d\u5148\u5ba1\u67e5\u5b83\u3002",
  "Compare the strongest review paths before relying on the rollout.":
    "\u5728\u4f9d\u8d56\u6b64\u6b21\u53d1\u5e03\u524d\uff0c\u6bd4\u8f83\u6700\u5f3a\u7684\u5ba1\u67e5\u8def\u5f84\u3002",
  "Keep open disagreements, answer requirements, missing evidence, and the current conclusion visible.":
    "\u6301\u7eed\u5c55\u793a\u672a\u89e3\u51b3\u5206\u6b67\u3001\u7b54\u6848\u8981\u6c42\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u5f53\u524d\u7ed3\u8bba\u3002",
  "Use built-in sample participants only.":
    "\u4ec5\u4f7f\u7528\u5185\u7f6e\u793a\u4f8b\u53c2\u4e0e\u8005\u3002",
  "Keep the conclusion provisional until a human reviews it.":
    "\u5728\u4eba\u7c7b\u5ba1\u9605\u524d\uff0c\u4fdd\u6301\u7ed3\u8bba\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002",
  "Keep the conclusion provisional until reviewed.":
    "\u5728\u5b8c\u6210\u5ba1\u9605\u524d\uff0c\u4fdd\u6301\u7ed3\u8bba\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002",
  "Keep sample limitations visible.":
    "\u6301\u7eed\u5c55\u793a\u793a\u4f8b\u9650\u5236\u3002",
  "Preserve unresolved disagreements and missing evidence.":
    "\u4fdd\u7559\u672a\u89e3\u51b3\u5206\u6b67\u548c\u7f3a\u5931\u8bc1\u636e\u3002",
  "Review the rollout in stages before relying on the recommendation.":
    "\u5728\u4f9d\u8d56\u5efa\u8bae\u524d\uff0c\u5206\u9636\u6bb5\u5ba1\u67e5\u6b64\u6b21\u53d1\u5e03\u3002",
  "The team should compare options, disagreements, risks, and missing evidence before acting.":
    "\u56e2\u961f\u5e94\u5728\u884c\u52a8\u524d\u6bd4\u8f83\u9009\u9879\u3001\u5206\u6b67\u3001\u98ce\u9669\u548c\u7f3a\u5931\u8bc1\u636e\u3002",
  "Keep the conclusion provisional until unresolved issues are checked.":
    "\u5728\u672a\u89e3\u51b3\u95ee\u9898\u5b8c\u6210\u68c0\u67e5\u524d\uff0c\u4fdd\u6301\u7ed3\u8bba\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002",
  "A readable discussion should make remaining disagreements and next actions easy to inspect.":
    "\u53ef\u8bfb\u7684\u8ba8\u8bba\u5e94\u8ba9\u5269\u4f59\u5206\u6b67\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u6613\u4e8e\u68c0\u67e5\u3002",
  "Accept sample discussion material that has no open challenge in this walkthrough.":
    "\u63a5\u53d7\u672c\u6b21\u6f14\u793a\u4e2d\u6ca1\u6709\u516c\u5f00\u6311\u6218\u7684\u793a\u4f8b\u8ba8\u8bba\u6750\u6599\u3002",
  "Staged rollout review":
    "\u5206\u9636\u6bb5\u53d1\u5e03\u5ba1\u67e5",
  "Review the rollout in stages, keep alternatives visible, and treat the conclusion as provisional until risks and evidence gaps are checked.":
    "\u5206\u9636\u6bb5\u5ba1\u67e5\u6b64\u6b21\u53d1\u5e03\uff0c\u4fdd\u6301\u66ff\u4ee3\u65b9\u6848\u53ef\u89c1\uff0c\u5e76\u5728\u98ce\u9669\u548c\u8bc1\u636e\u7f3a\u53e3\u5b8c\u6210\u68c0\u67e5\u524d\u5c06\u7ed3\u8bba\u89c6\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002",
  "This is a built-in sample walkthrough.":
    "\u8fd9\u662f\u5185\u7f6e\u793a\u4f8b\u6f14\u793a\u3002",
  "The sample does not replace real participant or model input.":
    "\u8be5\u793a\u4f8b\u4e0d\u80fd\u66ff\u4ee3\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8f93\u5165\u3002",
  "A staged review helps the team compare options before relying on the rollout.":
    "\u5206\u9636\u6bb5\u5ba1\u67e5\u6709\u52a9\u4e8e\u56e2\u961f\u5728\u4f9d\u8d56\u6b64\u6b21\u53d1\u5e03\u524d\u6bd4\u8f83\u9009\u9879\u3002",
  "Users could rely on the sample conclusion without checking whether it matches their real rollout.":
    "\u7528\u6237\u53ef\u80fd\u5728\u672a\u68c0\u67e5\u5176\u662f\u5426\u5339\u914d\u771f\u5b9e\u53d1\u5e03\u7684\u60c5\u51b5\u4e0b\u4f9d\u8d56\u793a\u4f8b\u7ed3\u8bba\u3002",
  "The conclusion must keep limitations, disagreements, and next actions visible.":
    "\u7ed3\u8bba\u5fc5\u987b\u6301\u7eed\u5c55\u793a\u9650\u5236\u3001\u5206\u6b67\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u3002",
  "State that the conclusion is provisional and list what must be checked next.":
    "\u8bf4\u660e\u7ed3\u8bba\u4ecd\u662f\u4e34\u65f6\u7ed3\u8bba\uff0c\u5e76\u5217\u51fa\u63a5\u4e0b\u6765\u5fc5\u987b\u68c0\u67e5\u7684\u5185\u5bb9\u3002",
  "Organize the first responses into reviewable options, disagreements, requirements, and evidence needs.":
    "\u5c06\u521d\u59cb\u56de\u5e94\u6574\u7406\u4e3a\u53ef\u5ba1\u9605\u7684\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002",
  "Use a staged review path before relying on the rollout.":
    "\u5728\u4f9d\u8d56\u6b64\u6b21\u53d1\u5e03\u524d\uff0c\u91c7\u7528\u5206\u9636\u6bb5\u5ba1\u67e5\u8def\u5f84\u3002",
  "When reviewing a proposed rollout with limited evidence.":
    "\u5f53\u62df\u8bae\u53d1\u5e03\u7684\u8bc1\u636e\u6709\u9650\u65f6\u3002",
  "When the team needs a provisional decision and explicit next actions.":
    "\u5f53\u56e2\u961f\u9700\u8981\u4e34\u65f6\u51b3\u7b56\u548c\u660e\u786e\u4e0b\u4e00\u6b65\u884c\u52a8\u65f6\u3002",
  "The discussion keeps the strongest option, open disagreement, evidence gaps, and review actions visible together.":
    "\u8ba8\u8bba\u4f1a\u540c\u65f6\u5c55\u793a\u6700\u5f3a\u9009\u9879\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u5ba1\u67e5\u884c\u52a8\u3002",
  "This built-in sample is illustrative; replace it with real participant or model input for real decisions.":
    "\u6b64\u5185\u7f6e\u793a\u4f8b\u4ec5\u7528\u4e8e\u8bf4\u660e\uff1b\u771f\u5b9e\u51b3\u7b56\u8bf7\u66ff\u6362\u4e3a\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8f93\u5165\u3002",
  "The sample does not prove production readiness or real-world answer quality.":
    "\u8be5\u793a\u4f8b\u4e0d\u80fd\u8bc1\u660e\u751f\u4ea7\u5c31\u7eea\u6027\u6216\u771f\u5b9e\u4e16\u754c\u7b54\u6848\u8d28\u91cf\u3002",
  "The current conclusion is reviewable but still provisional.":
    "\u5f53\u524d\u7ed3\u8bba\u53ef\u5ba1\u9605\uff0c\u4f46\u4ecd\u662f\u4e34\u65f6\u7ed3\u8bba\u3002",
  "A team could mistake the sample walkthrough for a decision about its real rollout.":
    "\u56e2\u961f\u53ef\u80fd\u4f1a\u628a\u793a\u4f8b\u6f14\u793a\u8bef\u8ba4\u4e3a\u5173\u4e8e\u771f\u5b9e\u53d1\u5e03\u7684\u51b3\u7b56\u3002",
  "Real project evidence, stakeholder input, and provider-backed model perspectives were not included in this sample.":
    "\u6b64\u793a\u4f8b\u672a\u5305\u542b\u771f\u5b9e\u9879\u76ee\u8bc1\u636e\u3001\u5229\u76ca\u76f8\u5173\u65b9\u8f93\u5165\u548c\u7531\u63d0\u4f9b\u5546\u652f\u6301\u7684\u6a21\u578b\u89c6\u89d2\u3002",
  "The current conclusion remains provisional.":
    "\u5f53\u524d\u7ed3\u8bba\u4ecd\u662f\u4e34\u65f6\u7ed3\u8bba\u3002",
  "Run the discussion with the real rollout brief and real participants or model connections when ready.":
    "\u51c6\u5907\u597d\u540e\uff0c\u8bf7\u4f7f\u7528\u771f\u5b9e\u53d1\u5e03\u7b80\u62a5\u548c\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8fde\u63a5\u91cd\u65b0\u8fd0\u884c\u8ba8\u8bba\u3002",
  "Perspective A": "\u89c6\u89d2 A",
  "Perspective B": "\u89c6\u89d2 B",
  "Perspective C": "\u89c6\u89d2 C",
  "Discussion organizer": "\u8ba8\u8bba\u7ec4\u7ec7\u8005",
  "Option reviewer": "\u9009\u9879\u5ba1\u67e5\u8005",
  "Evidence checker": "\u8bc1\u636e\u6838\u67e5\u8005",
  Reviewer: "\u5ba1\u67e5\u8005",
  "Review coordinator": "\u5ba1\u67e5\u534f\u8c03\u8005",
  "Conclusion writer": "\u7ed3\u8bba\u8d77\u8349\u8005",
  "Risk reviewer": "\u98ce\u9669\u5ba1\u67e5\u8005",
  "This perspective is part of the strongest current options in the room.":
    "\u6b64\u89c6\u89d2\u5df2\u7eb3\u5165\u8ba8\u8bba\u5ba4\u4e2d\u7684\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002"
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
    resolveInitialLanguage(initialLanguage, readStoredLanguage())
  );
  const setLanguage = useCallback((nextLanguage: WebLanguage) => {
    setLanguageState(nextLanguage);
    writeStoredLanguage(nextLanguage);
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

function resolveInitialLanguage(
  initialLanguage: WebLanguage | undefined,
  storedLanguage: WebLanguage | undefined
): WebLanguage {
  if (initialLanguage && isSupportedLanguage(initialLanguage)) {
    return initialLanguage;
  }

  if (storedLanguage && isSupportedLanguage(storedLanguage)) {
    return storedLanguage;
  }

  return "en";
}

function isSupportedLanguage(value: unknown): value is WebLanguage {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as WebLanguage);
}

function readStoredLanguage(): WebLanguage | undefined {
  try {
    const storedLanguage = globalThis.localStorage?.getItem(WEB_LANGUAGE_STORAGE_KEY);

    return isSupportedLanguage(storedLanguage) ? storedLanguage : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredLanguage(language: WebLanguage) {
  try {
    globalThis.localStorage?.setItem(WEB_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Language persistence is a convenience; the visible switch remains authoritative.
  }
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
