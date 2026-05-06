# Models & Providers

The AI Gateway's unified API is built to be flexible, allowing you to switch between [different AI models](https://vercel.com/ai-gateway/models) and providers without rewriting parts of your application. This is useful for testing different models or when you want to change the underlying AI provider for cost or performance reasons. You can also configure [provider routing and model fallbacks](/docs/ai-gateway/provider-options) to ensure high availability and reliability.

To view the list of supported models and providers, check out the [AI Gateway models page](https://vercel.com/ai-gateway/models).

### [What are models and providers?](#what-are-models-and-providers)

Models are AI algorithms that process your input data to generate responses, such as [Grok](https://docs.x.ai/docs/models), [GPT-5](https://platform.openai.com/docs/models/gpt-5), or [Claude Sonnet 4](https://www.anthropic.com/claude/sonnet). Providers are the companies or services that host these models, such as [xAI](https://x.ai), [OpenAI](https://openai.com), or [Anthropic](https://anthropic.com).

In some cases, multiple providers, including the model creator, host the same model. For example, you can use the `xai/grok-4` model from [xAI](https://x.ai/) or the `openai/gpt-5` model from [OpenAI](https://openai.com), following the format `creator/model-name`.

Different providers may have different specifications for the same model such as different pricing and performance. You can choose the one that best fits your needs.

You can view the list of supported models and providers by following these steps:

1.  Go to the [AI Gateway tab](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai&title=Go+to+AI+Gateway) in your Vercel dashboard.
2.  Click on the Model List section on the left sidebar.

### [Specifying the model](#specifying-the-model)

There are two ways to specify the model and provider to use for an AI Gateway request:

- [As part of an AI SDK function call](#as-part-of-an-ai-sdk-function-call)
- [Globally for all requests in your application](#globally-for-all-requests-in-your-application)

#### [As part of an AI SDK function call](#as-part-of-an-ai-sdk-function-call)

In the AI SDK, you can specify the model and provider directly in your API calls using either plain strings or the AI Gateway provider. This allows you to switch models or providers for specific requests without affecting the rest of your application.

To use AI Gateway, specify a model and provider via a plain string, for example:

app/api/chat/route.ts

```
import { generateText } from 'ai';
import { NextRequest } from 'next/server';

export async function GET() {
  const result = await generateText({
    model: 'xai/grok-3',
    prompt: 'Tell me the history of the San Francisco Mission-style burrito.',
  });
  return Response.json(result);
}
```

You can test different models by changing the `model` parameter and opening your browser to `http://localhost:3000/api/chat`.

You can also use a provider instance. This can be useful if you'd like to create models to use with a [custom provider](https://ai-sdk.dev/docs/ai-sdk-core/provider-management#custom-providers) or if you'd like to use a Gateway provider with the AI SDK [Provider Registry](https://v5.ai-sdk.dev/docs/ai-sdk-core/provider-management#provider-registry).

Install the `@ai-sdk/gateway` package directly as a dependency in your project.

terminal

```
pnpm install @ai-sdk/gateway
```

You can change the model by changing the string passed to `gateway()`.

app/api/chat/route.ts

```
import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { NextRequest } from 'next/server';

export async function GET() {
  const result = await generateText({
    model: gateway('xai/grok-3'),
    prompt: 'Tell me the history of the San Francisco Mission-style burrito.',
  });
  return Response.json(result);
}
```

The example above uses the default `gateway` provider instance. You can also create a custom provider instance to use in your application. Creating a custom instance is useful when you need to specify a different environment variable for your API key, or when you need to set a custom base URL (for example, if you're working behind a corporate proxy server).

app/api/chat/route.ts

```
import { generateText } from 'ai';
import { createGateway } from '@ai-sdk/gateway';

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY, // the default environment variable for the API key
  baseURL: 'https://ai-gateway.vercel.sh/v1/ai', // the default base URL
});

export async function GET() {
  const result = await generateText({
    model: gateway('xai/grok-3'),
    prompt: 'Why is the sky blue?',
  });
  return Response.json(result);
}
```

#### [Globally for all requests in your application](#globally-for-all-requests-in-your-application)

The Vercel AI Gateway is the default provider for the AI SDK when a model is specified as a string. You can set a different provider as the default by assigning the provider instance to the `globalThis.AI_SDK_DEFAULT_PROVIDER` variable.

This is intended to be done in a file that runs before any other AI SDK calls. In the case of a Next.js application, you can do this in [`instrumentation.ts`](https://nextjs.org/docs/app/guides/instrumentation):

instrumentation.ts

```
import { openai } from '@ai-sdk/openai';

export async function register() {
  // This runs once when the Node.js runtime starts
  globalThis.AI_SDK_DEFAULT_PROVIDER = openai;

  // You can also do other initialization here
  console.log('App initialization complete');
}
```

Then, you can use the `generateText` function without specifying the provider in each call.

app/api/chat/route.ts

```
import { generateText } from 'ai';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const prompt = searchParams.get('prompt');

  if (!prompt) {
    return Response.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const result = await generateText({
    model: 'openai/gpt-5',
    prompt,
  });

  return Response.json(result);
}
```

### [Embedding models](#embedding-models)

Generate vector embeddings for semantic search, similarity matching, and retrieval-augmented generation (RAG).

#### [Single value](#single-value)

app/api/embed/route.ts

```
import { embed } from 'ai';

export async function GET() {
  const result = await embed({
    model: 'openai/text-embedding-3-small',
    value: 'Sunny day at the beach',
  });

  return Response.json(result);
}
```

#### [Multiple values](#multiple-values)

app/api/embed/route.ts

```
import { embedMany } from 'ai';

export async function GET() {
  const result = await embedMany({
    model: 'openai/text-embedding-3-small',
    values: ['Sunny day at the beach', 'Cloudy city skyline'],
  });

  return Response.json(result);
}
```

#### [Gateway provider instance](#gateway-provider-instance)

Alternatively, if you're using the Gateway provider instance, specify embedding models with `gateway.textEmbeddingModel(...)`.

app/api/embed/route.ts

```
import { embed } from 'ai';
import { gateway } from '@ai-sdk/gateway';

export async function GET() {
  const result = await embed({
    model: gateway.textEmbeddingModel('openai/text-embedding-3-small'),
    value: 'Sunny day at the beach',
  });

  return Response.json(result);
}
```

### [Dynamic model discovery](#dynamic-model-discovery)

The `getAvailableModels` function retrieves detailed information about all models configured for the `gateway` provider, including each model's `id`, `name`, `description`, and `pricing` details.

app/api/chat/route.ts

```
import { gateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';

const availableModels = await gateway.getAvailableModels();

availableModels.models.forEach((model) => {
  console.log(`${model.id}: ${model.name}`);
  if (model.description) {
    console.log(`  Description: ${model.description}`);
  }
  if (model.pricing) {
    console.log(`  Input: $${model.pricing.input}/token`);
    console.log(`  Output: $${model.pricing.output}/token`);
    if (model.pricing.cachedInputTokens) {
      console.log(
        `  Cached input (read): $${model.pricing.cachedInputTokens}/token`,
      );
    }
    if (model.pricing.cacheCreationInputTokens) {
      console.log(
        `  Cache creation (write): $${model.pricing.cacheCreationInputTokens}/token`,
      );
    }
  }
});

const { text } = await generateText({
  model: availableModels.models[0].id, // e.g., 'openai/gpt-5'
  prompt: 'Hello world',
});
```

#### [Filtering models by type](#filtering-models-by-type)

You can filter the available models by their type (e.g., to separate language models from embedding models) using the `modelType` property:

app/api/models/route.ts

```
import { gateway } from '@ai-sdk/gateway';

const { models } = await gateway.getAvailableModels();
const textModels = models.filter((m) => m.modelType === 'language');
const embeddingModels = models.filter((m) => m.modelType === 'embedding');

console.log(
  'Language models:',
  textModels.map((m) => m.id),
);
console.log(
  'Embedding models:',
  embeddingModels.map((m) => m.id),
);
```
