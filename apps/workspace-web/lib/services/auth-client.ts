


// Define types matching the backend API
export interface LoginCredentials {
  identifier: string;
  identifierType: 'email' | 'phone' | 'username';
  password?: string;
}

export interface UserSession {
  id: string;
  name: string;
  username: string;
  last_active_tenant_id?: string;
}

export interface LoginResponse {
  token: string;
  jwtToken: string;
  expiresInSeconds: number;
  user: UserSession;
}

export interface CreateOrgResponse {
  tenant: {
    id: string;
    name: string;
    // Add other fields if needed
  };
  site_account: {
    id: string;
    name: string;
    // Add other fields if needed
  };
}

export interface Tenant {
  id: string;
  name: string;
  // Add other fields if needed
}

export class AuthClient {
  private baseUrl: string;

  constructor(baseUrl: string = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  /**
   * Login to the application.
   * Returns the redirect path based on the user's last active tenant.
   */
  async login(credentials: LoginCredentials): Promise<{ redirectPath: string; response: LoginResponse }> {
    const res = await fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Login failed');
    }

    const data: LoginResponse = await res.json();

    // Determine redirect path
    let redirectPath = '/dashboard';
    if (data.user.last_active_tenant_id) {
      // If user has a last active tenant, redirect to that tenant's context
      redirectPath = `/t/${data.user.last_active_tenant_id}/dashboard`;
    } else {
      // Fallback: Try to fetch tenant list
      try {
        const tenants = await this.listTenants();
        if (tenants.length > 0) {
          // Redirect to the first tenant
          redirectPath = `/t/${tenants[0].id}/dashboard`;
        }
      } catch (e) {
        // Ignore error and stay on /dashboard
        console.warn('Failed to fetch tenants for fallback redirect', e);
      }
    }

    return { redirectPath, response: data };
  }

  /**
   * Create a new organization (Tenant + Site Account).
   */
  async createOrganization(name: string): Promise<CreateOrgResponse> {
    const res = await fetch(`${this.baseUrl}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create organization');
    }

    return res.json();
  }

  /**
   * List tenants for the current user.
   */
  async listTenants(): Promise<Tenant[]> {
    const res = await fetch(`${this.baseUrl}/tenants`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to list tenants');
    }

    return res.json();
  }
}

export const authClient = new AuthClient();
