"use client";

import { useEffect, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const STORAGE_KEY = "incisight_chat_history";
const MINIMIZED_KEY = "incisight_chat_minimized";

export default function ChatBox() {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const savedHistory = sessionStorage.getItem(STORAGE_KEY);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }

    const savedMinimized = sessionStorage.getItem(MINIMIZED_KEY);
    if (savedMinimized === "true") {
      setMinimized(true);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    sessionStorage.setItem(MINIMIZED_KEY, minimized ? "true" : "false");
  }, [minimized]);

  const sendMessage = async () => {
    if (!message.trim()) {
      setError("Please type a question first.");
      return;
    }

    const currentMessage = message.trim();

    setLoading(true);
    setError("");
    setMessage("");

    const updatedHistory: ChatMessage[] = [
      ...history,
      { role: "user", content: currentMessage },
    ];
    setHistory(updatedHistory);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: currentMessage }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data.error || "Something went wrong.";
        setError(errorMessage);
        setHistory([
          ...updatedHistory,
          { role: "assistant", content: `Error: ${errorMessage}` },
        ]);
        return;
      }

      setHistory([
        ...updatedHistory,
        {
          role: "assistant",
          content: data.fallback
            ? `Using database fallback:\n\n${data.reply}`
            : data.reply || "No response returned.",
        },
      ]);
    } catch (err) {
      console.error("Chat request failed:", err);
      const errorMessage = "Request failed. Check browser console and terminal.";
      setError(errorMessage);
      setHistory([
        ...updatedHistory,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setHistory([]);
    setError("");
    setMessage("");
    sessionStorage.removeItem(STORAGE_KEY);
  };

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[99999] isolate">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="rounded-full bg-black px-4 py-3 text-sm font-medium text-white shadow-2xl"
        >
          Chat
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[99999] isolate w-[calc(100vw-2rem)] max-w-80 sm:w-80">
      <div className="flex max-h-[70vh] flex-col rounded-xl border border-gray-300 bg-white p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-bold">Ask Ingredient</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearChat}
              className="text-xs text-neutral-500 hover:text-black"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="text-xs text-neutral-500 hover:text-black"
              aria-label="Minimize chat"
              title="Minimize"
            >
              −
            </button>
          </div>
        </div>

        <div className="mb-2 max-h-64 flex-1 overflow-y-auto rounded border bg-gray-50 p-2">
          {history.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Ask about an ingredient like zinc oxide or retinol.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((item, index) => (
                <div
                  key={index}
                  className={`rounded p-2 text-sm whitespace-pre-wrap leading-relaxed ${
                    item.role === "user"
                      ? "bg-black text-white"
                      : "border bg-white text-neutral-800"
                  }`}
                >
                  <span className="mb-1 block text-[10px] font-semibold uppercase opacity-70">
                    {item.role === "user" ? "You" : "Assistant"}
                  </span>
                  {item.content}
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          className="mb-2 w-full rounded border p-2 text-sm"
          placeholder="Ask about an ingredient..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendMessage();
            }
          }}
        />

        <button
          type="button"
          onClick={sendMessage}
          disabled={loading}
          className="w-full cursor-pointer rounded bg-black p-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Asking..." : "Ask"}
        </button>

        {error && (
          <div className="mt-2 rounded bg-red-100 p-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
