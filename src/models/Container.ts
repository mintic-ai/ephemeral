export interface Container {
  id: string;
  dockerId: string;
  image: string;
  status: 'creating' | 'running' | 'stopping' | 'stopped' | 'error';
  createdAt: Date;
  lastActivity: Date;
  connection: {
    host: string;
    port: number;
    url?: string;
  };
  environment: Record<string, string>;
  metadata: Record<string, any>;
}

export interface ContainerCreateRequest {
  image: string;
  environment?: Record<string, string>;
  ports?: number[];
}

export interface ContainerResponse {
  id: string;
  status: 'running' | 'stopped' | 'error';
  connection: {
    host: string;
    port: number;
    url?: string;
  };
  created_at: string;
  last_activity: string;
}