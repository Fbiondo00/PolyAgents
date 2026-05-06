# Provider Options

AI Gateway can route your AI model requests across multiple AI providers. Each provider offers different models, pricing, and performance characteristics. By default, Vercel AI Gateway dynamically chooses the default providers to give you the best experience based on a combination recent uptime and latency.

With the Gateway Provider Options however, you have control over the routing order and fallback behavior of the models.

If you want to customize individual AI model provider settings rather than general AI Gateway behavior, please refer to the model-specific provider options in the [AI SDK documentation](https://ai-sdk.dev/docs/foundations/prompts#provider-options).

## [Basic provider ordering](#basic-provider-ordering)

You can use the `order` array to specify the sequence in which providers should be attempted. Providers are specified using their `slug` string. You can find the slugs in the [table of available providers](#available-providers).

You can also copy the provider slug using the copy button next to a provider's name on a model's detail page. In the Vercel Dashboard:

1.  Click the AI Gateway tab,
2.  Then, click the Model List sub-tab on the left
3.  Click a model entry in the list.

The bottom section of the page lists the available providers for that model. The copy button next to a provider's name will copy their slug for pasting.

### [Getting started with adding a provider option](#getting-started-with-adding-a-provider-option)

1.  ### [Install the AI SDK package](#install-the-ai-sdk-package)

    First, ensure you have the necessary package installed:

    Terminal

    ```
    pnpm install ai
    ```

2.  ### [Configure the provider order in your request](#configure-the-provider-order-in-your-request)

    Use the `providerOptions.gateway.order` configuration:

    app/api/chat/route.ts

    ```
    import { streamText } from 'ai';

    export async function POST(request: Request) {
      const { prompt } = await request.json();

      const result = streamText({
        model: 'anthropic/claude-sonnet-4',
        prompt,
        providerOptions: {
          gateway: {
            order: ['bedrock', 'anthropic'], // Try Amazon Bedrock first, then Anthropic
          },
        },
      });

      return result.toUIMessageStreamResponse();
    }
    ```

    In this example:
    - The gateway will first attempt to use Amazon Bedrock to serve the Claude 4 Sonnet model
    - If Amazon Bedrock is unavailable or fails, it will fall back to Anthropic
    - Other providers (like Vertex AI) are still available but will only be used after the specified providers

3.  ### [Test the routing behavior](#test-the-routing-behavior)

    You can monitor which provider you used by checking the provider metadata in the response.

    app/api/chat/route.ts

    ```
    import { streamText } from 'ai';

    export async function POST(request: Request) {
      const { prompt } = await request.json();

      const result = streamText({
        model: 'anthropic/claude-sonnet-4',
        prompt,
        providerOptions: {
          gateway: {
            order: ['bedrock', 'anthropic'],
          },
        },
      });

      // Log which provider was actually used
      console.log(JSON.stringify(await result.providerMetadata, null, 2));

      return result.toUIMessageStreamResponse();
    }
    ```

## [Example provider metadata output](#example-provider-metadata-output)

```
{
  "zai": {},
  "gateway": {
    "routing": {
      "originalModelId": "zai/glm-4.6",
      "resolvedProvider": "zai",
      "resolvedProviderApiModelId": "glm-4.6",
      "internalResolvedModelId": "zai:glm-4.6",
      "fallbacksAvailable": [],
      "internalReasoning": "Selected zai as preferred provider for glm-4.6. 0 fallback(s) available: ",
      "planningReasoning": "System credentials planned for: zai. Total execution order: zai(system)",
      "canonicalSlug": "zai/glm-4.6",
      "finalProvider": "zai",
      "attempts": [
        {
          "provider": "zai",
          "internalModelId": "zai:glm-4.6",
          "providerApiModelId": "glm-4.6",
          "credentialType": "system",
          "success": true,
          "startTime": 458753.407267,
          "endTime": 459891.705775
        }
      ],
      "modelAttemptCount": 1,
      "modelAttempts": [
        {
          "modelId": "zai/glm-4.6",
          "canonicalSlug": "zai/glm-4.6",
          "success": true,
          "providerAttemptCount": 1,
          "providerAttempts": [
            {
              "provider": "zai",
              "internalModelId": "zai:glm-4.6",
              "providerApiModelId": "glm-4.6",
              "credentialType": "system",
              "success": true,
              "startTime": 458753.407267,
              "endTime": 459891.705775
            }
          ]
        }
      ],
      "totalProviderAttemptCount": 1
    },
    "cost": "0.0045405",
    "marketCost": "0.0045405",
    "generationId": "gen_01K8KPJ0FZA7172X6CSGNZGDWY"
  }
}
```

The `gateway.cost` value is the amount debited from your AI Gateway Credits balance for this request. It is returned as a decimal string. The `gateway.marketCost` represents the market rate cost for the request. The `gateway.generationId` is a unique identifier for this generation that can be used with the [Generation Lookup API](/docs/ai-gateway/usage#generation-lookup). For more on pricing see [Pricing](/docs/ai-gateway/pricing).

In cases where your request encounters issues with one or more providers or if your BYOK credentials fail, you'll find error detail in the `attempts` field of the provider metadata:

```
"attempts": [
  {
    "provider": "novita",
    "internalModelId": "novita:zai-org/glm-4.5",
    "providerApiModelId": "zai-org/glm-4.5",
    "credentialType": "byok",
    "success": false,
    "error": "Unauthorized",
    "startTime": 1754639042520,
    "endTime": 1754639042710
  },
  {
    "provider": "novita",
    "internalModelId": "novita:zai-org/glm-4.5",
    "providerApiModelId": "zai-org/glm-4.5",
    "credentialType": "system",
    "success": true,
    "startTime": 1754639042710,
    "endTime": 1754639043353
  }
]
```

## [Restrict providers with the `only` filter](#restrict-providers-with-the-only-filter)

Use the `only` array to restrict routing to a specific subset of providers. Providers are specified by their slug and are matched against the model's available providers.

app/api/chat/route.ts

```
import { streamText } from 'ai';

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const result = streamText({
    model: 'anthropic/claude-sonnet-4',
    prompt,
    providerOptions: {
      gateway: {
        only: ['bedrock', 'anthropic'], // Only consider these providers.
        // This model is also available via 'vertex', but it won't be considered.
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
```

In this example:

- Restriction: Only `bedrock` and `anthropic` will be considered for routing and fallbacks.
- Error on mismatch: If none of the specified providers are available for the model, the request fails with an error indicating the allowed providers.

## [Using `only` together with `order`](#using-only-together-with-order)

When both `only` and `order` are provided, the `only` filter is applied first to define the allowed set, and then `order` defines the priority within that filtered set. Practically, the end result is the same as taking your `order` list and intersecting it with the `only` list.

app/api/chat/route.ts

```
import { streamText } from 'ai';

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const result = streamText({
    model: 'anthropic/claude-sonnet-4',
    prompt,
    providerOptions: {
      gateway: {
        only: ['anthropic', 'vertex'],
        order: ['vertex', 'bedrock', 'anthropic'],
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
```

The final order will be `vertex → anthropic` (providers listed in `order` but not in `only` are ignored).

## [Model fallbacks with the `models` option](#model-fallbacks-with-the-models-option)

You can specify fallback models that will be tried in order if the primary model fails or is unavailable. This provides model-level fallback in addition to provider-level routing.

app/api/chat/route.ts

```
import { streamText } from 'ai';

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const result = streamText({
    model: 'openai/gpt-4o', // Primary model
    prompt,
    providerOptions: {
      gateway: {
        models: ['openai/gpt-5-nano', 'gemini-2.0-flash'], // Fallback models
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
```

In this example:

- The gateway will first attempt to use the primary model (`openai/gpt-4o`)
- If the primary model fails or is unavailable, it will try `openai/gpt-5-nano`
- If that also fails, it will try `gemini-2.0-flash`
- The response will come from the first model that succeeds

### [Combining `models` with provider options](#combining-models-with-provider-options)

You can combine model fallbacks with provider routing options for comprehensive failover strategies:

app/api/chat/route.ts

```
import { streamText } from 'ai';

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const result = streamText({
    model: 'openai/gpt-4o',
    prompt,
    providerOptions: {
      gateway: {
        models: ['openai/gpt-5-nano', 'anthropic/claude-sonnet-4'],
        order: ['azure', 'openai'], // Provider preference for each model
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
```

This configuration will:

1.  Try `openai/gpt-4o` via Azure first, then OpenAI
2.  If both fail, try `openai/gpt-5-nano` via Azure first, then OpenAI
3.  If those fail, try `anthropic/claude-sonnet-4` via available providers

## [Combining AI Gateway provider options with provider-specific options](#combining-ai-gateway-provider-options-with-provider-specific-options)

You can combine AI Gateway provider options with provider-specific options. This allows you to control both the routing behavior and provider-specific settings in the same request:

app/api/chat/route.ts

```
import { streamText } from 'ai';

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const result = streamText({
    model: 'anthropic/claude-sonnet-4',
    prompt,
    providerOptions: {
      anthropic: {
        thinkingBudget: 0.001,
      },
      gateway: {
        order: ['vertex'],
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
```

In this example:

- We're using an Anthropic model (e.g. Claude 4 Sonnet) but accessing it through Vertex AI
- The Anthropic-specific options still apply to the model:
  - `thinkingBudget` sets a cost limit of $0.001 per request for the Claude model
- You can read more about provider-specific options in the [AI SDK documentation](https://ai-sdk.dev/docs/foundations/prompts#provider-options)

## [Reasoning](#reasoning)

For models that support reasoning (also known as "thinking"), you can use `providerOptions` to configure reasoning behavior. The example below shows how to control the computational effort and summary detail level when using OpenAI's `gpt-oss-120b` model.

For more details on reasoning support across different models and providers, see the [AI SDK providers documentation](https://ai-sdk.dev/providers/ai-sdk-providers), including [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai#reasoning), [DeepSeek](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#reasoning), and [Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#reasoning).

app/api/chat/route.ts

```
import { streamText } from 'ai';

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const result = streamText({
    model: 'openai/gpt-oss-120b',
    prompt,
    providerOptions: {
      openai: {
        reasoningEffort: 'high',
        reasoningSummary: 'detailed',
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
```

Note: For `openai/gpt-5` and `openai/gpt-5.1` models, you must set both `reasoningEffort` and `reasoningSummary` in `providerOptions` to receive reasoning output.

```
providerOptions: {
  openai: {
    reasoningEffort: 'high', // or 'minimal', 'low', 'medium', 'none'
    reasoningSummary: 'detailed', // or 'auto', 'concise'
  },
}
```

## [Available providers](#available-providers)

You can view the available models for a provider in the Model List section under the [AI Gateway](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai&title=Go+to+AI+Gateway) tab in your Vercel dashboard or in the public [models page](https://vercel.com/ai-gateway/models).

| Slug         | Name                                                                                 | Website                                                          |
| ------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `alibaba`    | Alibaba Cloud                                                                        | [alibabacloud.com](https://www.alibabacloud.com)                 |
| `anthropic`  | [Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)                 | [anthropic.com](https://anthropic.com)                           |
| `arcee-ai`   | Arcee AI                                                                             | [arcee.ai](https://arcee.ai)                                     |
| `azure`      | [Azure](https://ai-sdk.dev/providers/ai-sdk-providers/azure)                         | [ai.azure.com](https://ai.azure.com/)                            |
| `baseten`    | [Baseten](https://ai-sdk.dev/providers/openai-compatible-providers/baseten)          | [baseten.co](https://www.baseten.co/)                            |
| `bedrock`    | [Amazon Bedrock](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock)       | [aws.amazon.com/bedrock](https://aws.amazon.com/bedrock)         |
| `bfl`        | [Black Forest Labs](https://ai-sdk.dev/providers/ai-sdk-providers/black-forest-labs) | [bfl.ai](https://bfl.ai/)                                        |
| `cerebras`   | [Cerebras](https://ai-sdk.dev/providers/ai-sdk-providers/cerebras)                   | [cerebras.net](https://www.cerebras.net)                         |
| `cohere`     | [Cohere](https://ai-sdk.dev/providers/ai-sdk-providers/cohere)                       | [cohere.com](https://cohere.com)                                 |
| `deepinfra`  | [DeepInfra](https://ai-sdk.dev/providers/ai-sdk-providers/deepinfra)                 | [deepinfra.com](https://deepinfra.com)                           |
| `deepseek`   | [DeepSeek](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek)                   | [deepseek.ai](https://deepseek.ai)                               |
| `fireworks`  | [Fireworks](https://ai-sdk.dev/providers/ai-sdk-providers/fireworks)                 | [fireworks.ai](https://fireworks.ai)                             |
| `google`     | [Google](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)         | [ai.google.dev](https://ai.google.dev/)                          |
| `groq`       | [Groq](https://ai-sdk.dev/providers/ai-sdk-providers/groq)                           | [groq.com](https://groq.com)                                     |
| `inception`  | Inception                                                                            | [inceptionlabs.ai](https://inceptionlabs.ai)                     |
| `meituan`    | Meituan                                                                              | [longcat.ai](https://longcat.ai/)                                |
| `minimax`    | MiniMax                                                                              | [minimax.io](https://www.minimax.io/)                            |
| `mistral`    | [Mistral](https://ai-sdk.dev/providers/ai-sdk-providers/mistral)                     | [mistral.ai](https://mistral.ai)                                 |
| `moonshotai` | Moonshot AI                                                                          | [moonshot.ai](https://www.moonshot.ai)                           |
| `morph`      | Morph                                                                                | [morphllm.com](https://morphllm.com)                             |
| `novita`     | Novita                                                                               | [novita.ai](https://novita.ai/)                                  |
| `openai`     | [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai)                       | [openai.com](https://openai.com)                                 |
| `parasail`   | Parasail                                                                             | [parasail.com](https://www.parasail.io)                          |
| `perplexity` | [Perplexity](https://ai-sdk.dev/providers/ai-sdk-providers/perplexity)               | [perplexity.ai](https://www.perplexity.ai)                       |
| `streamlake` | StreamLake                                                                           | [streamlake.ai](https://streamlake.ai/)                          |
| `vercel`     | [Vercel](https://ai-sdk.dev/providers/ai-sdk-providers/vercel)                       |                                                                  |
| `vertex`     | [Vertex AI](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex)             | [cloud.google.com/vertex-ai](https://cloud.google.com/vertex-ai) |
| `voyage`     | [Voyage AI](https://ai-sdk.dev/providers/community-providers/voyage-ai)              | [voyageai.com](https://www.voyageai.com)                         |
| `xai`        | [xAI](https://ai-sdk.dev/providers/ai-sdk-providers/xai)                             | [x.ai](https://x.ai)                                             |
| `zai`        | Z.ai                                                                                 | [z.ai](https://z.ai/model-api)                                   |

Provider availability may vary by model. Some models may only be available through specific providers or may have different capabilities depending on the provider used.
