// Datasets for the Ask tab, each with questions that make the page visibly change.

export const ASK_DATASETS = {
  weather: {
    label: "World weather",
    provider: "Open-Meteo",
    homepage: "https://open-meteo.com",
    prompts: [
      "Where is it hottest right now?",
      "Do I need an umbrella anywhere today?",
      "Show me Tokyo's next 12 hours",
      "Where is it night time?",
      "Tokyo vs London for the next 3 hours",
      "Just give me a simple table",
    ],
  },
  crypto: {
    label: "Crypto market",
    provider: "Kraken",
    homepage: "https://docs.kraken.com/api/",
    prompts: [
      "Which coin moved the most today?",
      "Is anything crashing?",
      "Show me Bitcoin over the last 24 hours",
      "What's the cheapest coin?",
      "Bitcoin vs Ethereum over the last 6 hours",
      "Just the prices, keep it simple",
    ],
  },
} as const

export type AskDatasetId = keyof typeof ASK_DATASETS
