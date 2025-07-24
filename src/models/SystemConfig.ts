export interface SystemConfig {
  docker: {
    socketPath: string;
    defaultImage: string;
    networkMode: string;
    portRange: {
      start: number;
      end: number;
    };
  };
  cleanup: {
    interval: number;
    inactivityTimeout: number;
    maxRetryAttempts: number;
    forceRemovalTimeout: number;
  };
  api: {
    port: number;
    host: string;
    authEnabled: boolean;
  };
}

export interface DockerConfig {
  socketPath: string;
  defaultImage: string;
  networkMode: string;
  portRange: {
    start: number;
    end: number;
  };
}

export interface CleanupConfig {
  interval: number;
  inactivityTimeout: number;
  maxRetryAttempts: number;
  forceRemovalTimeout: number;
}

export interface ApiConfig {
  port: number;
  host: string;
  authEnabled: boolean;
}