'use client';

import React, { useState } from 'react';
import { authClient } from '@/lib/services/auth-client';

// Mock data for members list since API is not ready
const MOCK_MEMBERS = [
    { id: '1', name: 'Alice Smith', email: 'alice@example.com', role: 'Owner' },
    { id: '2', name: 'Bob Jones', email: 'bob@example.com', role: 'Member' },
];

export default function OrganizationPage() {
    const [orgName, setOrgName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [message, setMessage] = useState('');

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgName.trim()) return;

        setIsCreating(true);
        setMessage('');

        try {
            await authClient.createOrganization(orgName);
            setMessage(`Organization "${orgName}" created successfully!`);
            setOrgName('');
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setIsCreating(false);
        }
    };

    const handleInvite = () => {
        // Placeholder for invite logic
        alert('Invite modal would open here');
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Organization Settings</h1>

            {/* Create Organization Section */}
            <div className="bg-white p-6 rounded-lg shadow mb-8">
                <h2 className="text-xl font-semibold mb-4">Create New Organization</h2>
                <form onSubmit={handleCreateOrg} className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-1">
                            Organization Name
                        </label>
                        <input
                            id="orgName"
                            type="text"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g. Acme Corp"
                            disabled={isCreating}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isCreating || !orgName.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isCreating ? 'Creating...' : 'Create Organization'}
                    </button>
                </form>
                {message && (
                    <p className={`mt-4 text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                        {message}
                    </p>
                )}
            </div>

            {/* Members List Section */}
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Members</h2>
                    <button
                        onClick={handleInvite}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                        Invite User
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {MOCK_MEMBERS.map((member) => (
                                <tr key={member.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{member.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{member.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{member.role}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
