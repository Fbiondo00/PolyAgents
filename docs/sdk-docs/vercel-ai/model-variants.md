# Model Variants

Some AI inference providers offer special variants of models. These models can have different features such as a larger context size. They may incur different costs associated with requests as well.

When AI Gateway makes these models available they will be highlighted on the model detail page with a Model Variants section in the relevant provider card providing an overview of the feature set and linking to more detail.

Model variants sometimes rely on preview or beta features offered by the inference provider. Their ongoing availability can therefore be less predictable than that of a stable model feature. Check the provider's site for the latest information.

### [Anthropic Claude Sonnet 4: 1M token context (beta)](#anthropic-claude-sonnet-4:-1m-token-context-beta)

Enable with header `anthropic-beta: context-1m-2025-08-07`.

- Learn more: [Announcement](https://www.anthropic.com/news/1m-context), [Context windows docs](https://docs.anthropic.com/en/docs/build-with-claude/context-windows#1m-token-context-window)
- Pricing (summary): If total input tokens (prompt + cache reads/writes) exceed 200K, input is charged 2× and output 1.5×; otherwise standard rates apply. See [pricing details](https://docs.anthropic.com/en/docs/about-claude/pricing#long-context-pricing).

TypeScript (AI SDK)TypeScript (OpenAI)Python (OpenAI)

ai-sdk.ts

```
import { streamText } from 'ai';
import { largePrompt } from './largePrompt.ts';

const result = streamText({
  headers: {
    'anthropic-beta': 'context-1m-2025-08-07',
  },
  model: 'anthropic/claude-sonnet-4',
  prompt: `You have a big brain. Summarize into 3 sentences: ${largePrompt}`,
  providerOptions: {
    gateway: { only: ['anthropic'] },
  },
});

for await (const part of result.textStream) {
  process.stdout.write(part);
}
// Log final chunk with provider metadata detail.
console.log(JSON.stringify(await result.providerMetadata, null, 2));
```

openai.ts

```
import OpenAI from 'openai';
import { largePrompt } from './largePrompt.ts';

const openai = new OpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: 'https://ai-gateway.vercel.sh/v1',
});

// @ts-expect-error
const stream = await openai.chat.completions.create(
  {
    model: 'anthropic/claude-sonnet-4',
    messages: [
      {
        role: 'user',
        content: `You have a big brain. Summarize into 3 sentences: ${largePrompt}`,
      },
    ],
    stream: true,
    providerOptions: {
      gateway: { only: ['anthropic'] },
    },
  },
  {
    headers: {
      'anthropic-beta': 'context-1m-2025-08-07',
    },
  },
);

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  } else {
    // Log final chunk with provider metadata detail.
    console.log(JSON.stringify(chunk, null, 2));
  }
}
```

openai.py

```
import json
import os
from openai import OpenAI

client = OpenAI(
  api_key=os.getenv('AI_GATEWAY_API_KEY'),
  base_url='https://ai-gateway.vercel.sh/v1'
)
large_prompt = 'your-large-prompt'

stream = client.chat.completions.create(
    model='anthropic/claude-sonnet-4',
    messages=[
        {
            'role': 'user',
            'content': f'You have a big brain. Summarize into 3 sentences: {large_prompt}',
        },
    ],
    extra_headers={
        'anthropic-beta': 'context-1m-2025-08-07',
    },
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end='', flush=True)
    # Log final chunk with provider metadata detail.
    if chunk.choices[0].finish_reason and hasattr(chunk.choices[0].delta, 'provider_metadata') and chunk.choices[0].delta.provider_metadata:
        print('\nProvider metadata:')
        print(json.dumps(
            chunk.choices[0].delta.provider_metadata, indent=2))
```
