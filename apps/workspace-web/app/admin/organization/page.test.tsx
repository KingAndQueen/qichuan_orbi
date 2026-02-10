import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OrganizationPage from './page';
import { authClient } from '@/lib/services/auth-client';

// Mock authClient
vi.mock('@/lib/services/auth-client', () => ({
    authClient: {
        createOrganization: vi.fn(),
    },
}));

// Mock alert
global.alert = vi.fn();

describe('OrganizationPage', () => {
    it('renders the page correctly', () => {
        render(<OrganizationPage />);

        expect(screen.getByText('Organization Settings')).toBeDefined();
        expect(screen.getByText('Create New Organization')).toBeDefined();
        expect(screen.getByText('Members')).toBeDefined();

        // Check mock members are rendered
        expect(screen.getByText('Alice Smith')).toBeDefined();
        expect(screen.getByText('Bob Jones')).toBeDefined();
    });

    it('calls createOrganization when form is submitted', async () => {
        render(<OrganizationPage />);

        const input = screen.getByLabelText('Organization Name');
        const button = screen.getByRole('button', { name: /Create Organization/i });

        fireEvent.change(input, { target: { value: 'New Corp' } });
        fireEvent.click(button);

        expect(button).toBeDisabled(); // Should be disabled while creating

        await waitFor(() => {
            expect(authClient.createOrganization).toHaveBeenCalledWith('New Corp');
        });

        // Check success message
        await waitFor(() => {
            expect(screen.getByText('Organization "New Corp" created successfully!')).toBeDefined();
        });
    });

    it('handles invite button click', () => {
        render(<OrganizationPage />);

        const inviteButton = screen.getByRole('button', { name: /Invite User/i });
        fireEvent.click(inviteButton);

        expect(global.alert).toHaveBeenCalledWith('Invite modal would open here');
    });
});
