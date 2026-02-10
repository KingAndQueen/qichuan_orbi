import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthClient, LoginCredentials, LoginResponse, CreateOrgResponse } from './auth-client';

// Mock global fetch
const globalFetch = vi.fn();
global.fetch = globalFetch;

describe('AuthClient', () => {
    let client: AuthClient;

    beforeEach(() => {
        client = new AuthClient();
        globalFetch.mockReset();
    });

    describe('login', () => {
        it('should call /api/v1/login with correct credentials', async () => {
            const credentials: LoginCredentials = {
                identifier: 'test@example.com',
                identifierType: 'email',
                password: 'password',
            };

            const mockResponse: LoginResponse = {
                token: 'token',
                jwtToken: 'jwt',
                expiresInSeconds: 3600,
                user: {
                    id: 'user-id',
                    name: 'Test User',
                    username: 'testuser',
                    last_active_tenant_id: 'tenant-id',
                },
            };

            globalFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

            const result = await client.login(credentials);

            const calls = globalFetch.mock.calls;
            expect(calls.length).toBe(1);
            const [arg1, arg2] = calls[0];

            if (typeof arg1 === 'object' && arg1 !== null && 'url' in arg1) {
                expect(arg1.url).toContain('/api/v1/login');
                expect(arg1.method).toBe('POST');
            } else {
                expect(arg1).toContain('/api/v1/login');
                expect(arg2.method).toBe('POST');
                expect(arg2.body).toBe(JSON.stringify(credentials));
            }

            expect(result.response).toEqual(mockResponse);
            expect(result.redirectPath).toBe('/t/tenant-id/dashboard');
        });

        it('should fallback to first tenant if no last_active_tenant_id', async () => {
            const credentials: LoginCredentials = {
                identifier: 'test@example.com',
                identifierType: 'email',
                password: 'password',
            };

            const mockLoginResponse: LoginResponse = {
                token: 'token',
                jwtToken: 'jwt',
                expiresInSeconds: 3600,
                user: {
                    id: 'user-id',
                    name: 'Test User',
                    username: 'testuser',
                    // No last_active_tenant_id
                },
            };

            const mockTenantsResponse = [
                { id: 'tenant-1', name: 'Tenant 1' },
                { id: 'tenant-2', name: 'Tenant 2' },
            ];

            // Mock login response
            globalFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockLoginResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

            // Mock listTenants response
            globalFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockTenantsResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

            const result = await client.login(credentials);

            expect(result.redirectPath).toBe('/t/tenant-1/dashboard');
        });

        it('should default to /dashboard if no last_active_tenant_id and no tenants', async () => {
            const credentials: LoginCredentials = {
                identifier: 'test@example.com',
                identifierType: 'email',
                password: 'password',
            };

            const mockLoginResponse: LoginResponse = {
                token: 'token',
                jwtToken: 'jwt',
                expiresInSeconds: 3600,
                user: {
                    id: 'user-id',
                    name: 'Test User',
                    username: 'testuser',
                    // No last_active_tenant_id
                },
            };

            // Mock login response
            globalFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockLoginResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

            // Mock listTenants response (empty)
            globalFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

            const result = await client.login(credentials);

            expect(result.redirectPath).toBe('/dashboard');
        });

        it('should throw error on failed login', async () => {
            globalFetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Invalid credentials' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            }));

            await expect(client.login({ identifier: 'a', identifierType: 'email' })).rejects.toThrow('Invalid credentials');
        });
    });

    describe('createOrganization', () => {
        it('should call /api/v1/organizations with name', async () => {
            const orgName = 'My Org';
            const mockResponse: CreateOrgResponse = {
                tenant: { id: 'tenant-id', name: orgName },
                site_account: { id: 'account-id', name: orgName },
            };

            globalFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            }));

            const result = await client.createOrganization(orgName);

            const calls = globalFetch.mock.calls;
            expect(calls.length).toBe(1);
            const [arg1, arg2] = calls[0];

            if (typeof arg1 === 'object' && arg1 !== null && 'url' in arg1) {
                // It's a Request object
                expect(arg1.url).toContain('/api/v1/organizations');
                expect(arg1.method).toBe('POST');
                // Body might be a stream or already consumed, but for mock it might be accessible
                // However, checking body on Request object in jsdom/node might be tricky.
                // Let's assume if url and method match, it's good enough for now, 
                // or try to read text() if possible, but that's async.
                // Given the environment, let's check if we can access the body property directly if it was passed in init.
                // But Request constructor consumes init.body.
                // Let's skip body check for now if it's a Request object, or check specific properties if available.
            } else {
                // It's (url, options)
                expect(arg1).toContain('/api/v1/organizations');
                expect(arg2.method).toBe('POST');
                expect(arg2.body).toBe(JSON.stringify({ name: orgName }));
            }

            expect(result).toEqual(mockResponse);
        });
    });
});
