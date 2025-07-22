export interface FalModel {
  id: string;
  modelId: string;
  title: string;
  category: string;
  tags: string[];
  shortDescription: string;
  thumbnailUrl: string;
  modelUrl: string;
  licenseType: string;
  date: string;
  highlighted: boolean;
  deprecated: boolean;
  kind: string;
}

interface FalApiResponse {
  result: {
    data: {
      json: {
        items: FalModel[];
      };
    };
  };
}

export class FalApiClient {
  private models: FalModel[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const url = 'https://fal.ai/api/trpc/models.list?batch=1&input=' + encodeURIComponent(JSON.stringify({
        "0": {
          "json": {
            "keywords": "",
            "categories": [],
            "tags": [],
            "type": [],
            "deprecated": false,
            "pendingEnterprise": false,
            "sort": "relevant",
            "page": 1,
            "limit": 100,
            "favorites": false,
            "useCache": true
          }
        }
      }));

      const response = await fetch(url);
      const data = await response.json() as FalApiResponse[];
      
      if (data && data[0]?.result?.data?.json?.items) {
        this.models = data[0].result.data.json.items;
        this.initialized = true;
        console.log(`Loaded ${this.models.length} FAL models`);
      }
    } catch (error) {
      console.error('Failed to initialize FAL API client:', error);
      throw error;
    }
  }

  getAllModels(): FalModel[] {
    return this.models;
  }

  searchModels(query: string): FalModel[] {
    const lowercaseQuery = query.toLowerCase();
    
    return this.models.filter(model => {
      const searchableText = `${model.title} ${model.shortDescription} ${model.category} ${model.tags.join(' ')}`.toLowerCase();
      return searchableText.includes(lowercaseQuery);
    });
  }

  getModelsByCategory(category: string): FalModel[] {
    return this.models.filter(model => model.category === category);
  }

  getModelById(id: string): FalModel | undefined {
    return this.models.find(model => model.id === id);
  }

  async fetchOpenAPISpec(endpointId: string): Promise<any | null> {
    try {
      const url = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpointId)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Failed to fetch OpenAPI spec for ${endpointId}: ${response.status}`);
        return null;
      }
      
      const spec = await response.json();
      return spec;
    } catch (error) {
      console.error(`Error fetching OpenAPI spec for ${endpointId}:`, error);
      return null;
    }
  }

  async getModelWithOpenAPISpec(endpointId: string): Promise<{ model: FalModel; spec: any } | null> {
    const model = this.getModelById(endpointId);
    if (!model) return null;
    
    const spec = await this.fetchOpenAPISpec(endpointId);
    if (!spec) return null;
    
    return { model, spec };
  }
}

export const falApiClient = new FalApiClient();