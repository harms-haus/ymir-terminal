export interface AuthRequest {
  password: string;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
}
