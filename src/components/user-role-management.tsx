'use client';

import { useState } from 'react';
import { createUserWithRole, setUserRole } from '@/actions/users';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { UserRole, UserWithRole } from '@/types';

interface UserRoleManagementProps {
  users: UserWithRole[];
  currentUserId: string;
}

interface CreatedUserResult {
  id: string;
  email: string;
  role: UserRole;
  temporaryPassword: string;
}

function getRoleLabel(role: UserRole | null) {
  if (role === 'admin') return 'Admin';
  if (role === 'sales') return 'Sales';
  return 'Geen rol';
}

function getActionErrorMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const values = Object.values(error as Record<string, unknown>);
    const firstMessage = values
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .find((value): value is string => typeof value === 'string');
    if (firstMessage) return firstMessage;
  }
  return 'An error occurred';
}

export function UserRoleManagement({
  users: initialUsers,
  currentUserId,
}: UserRoleManagementProps) {
  const [users, setUsers] = useState(initialUsers);
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>(() =>
    initialUsers.reduce<Record<string, UserRole>>((acc, user) => {
      acc[user.id] = user.role ?? 'sales';
      return acc;
    }, {})
  );
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('sales');
  const [createLoading, setCreateLoading] = useState(false);
  const [createdUser, setCreatedUser] = useState<CreatedUserResult | null>(null);

  const handleDraftRoleChange = (userId: string, role: UserRole) => {
    setDraftRoles((prev) => ({ ...prev, [userId]: role }));
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateLoading(true);
    setError(null);
    setCreatedUser(null);

    const result = await createUserWithRole({ email: createEmail, role: createRole });

    if ('error' in result) {
      setError(getActionErrorMessage(result.error));
      setCreateLoading(false);
      return;
    }

    const newUser = result.data;
    setUsers((prev) => [
      { id: newUser.id, email: newUser.email, role: newUser.role },
      ...prev.filter((user) => user.id !== newUser.id),
    ]);
    setDraftRoles((prev) => ({ ...prev, [newUser.id]: newUser.role }));
    setCreatedUser(newUser);
    setCreateEmail('');
    setCreateRole('sales');
    setCreateLoading(false);
  };

  const handleSaveRole = async (userId: string) => {
    const role = draftRoles[userId];
    if (!role) return;

    setLoadingUserId(userId);
    setError(null);

    const result = await setUserRole(userId, role);

    if ('error' in result) {
      setError(getActionErrorMessage(result.error));
      setLoadingUserId(null);
      return;
    }

    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role } : user))
    );
    setLoadingUserId(null);
  };

  const copyTemporaryPassword = async () => {
    if (!createdUser) return;
    await navigator.clipboard.writeText(createdUser.temporaryPassword);
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {createdUser && (
        <Alert className="border-emerald-500/40 bg-emerald-500/10">
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">User created: {createdUser.email}</p>
              <p className="text-sm text-muted-foreground">
                Temporary password. Copy it now; it will not be shown again.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-background px-2 py-1 text-sm">
                  {createdUser.temporaryPassword}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={copyTemporaryPassword}>
                  Copy password
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create user</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
                placeholder="name@example.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={createRole} onValueChange={(value) => setCreateRole(value as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={createLoading}>
              {createLoading ? 'Creating...' : 'Create user'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Users</h2>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const selectedRole = draftRoles[user.id] ?? 'sales';
                const isOwnAccount = user.id === currentUserId;
                const isLoading = loadingUserId === user.id;
                const hasChanges = user.role !== selectedRole;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.email ?? 'Geen e-mailadres'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex rounded-md border px-2 py-1 text-xs font-medium',
                          user.role === 'admin'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : user.role === 'sales'
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-muted-foreground/30 text-muted-foreground'
                        )}
                      >
                        {getRoleLabel(user.role)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={selectedRole}
                          onValueChange={(value) =>
                            handleDraftRoleChange(user.id, value as UserRole)
                          }
                          disabled={isOwnAccount || isLoading}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sales">Sales</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          onClick={() => handleSaveRole(user.id)}
                          disabled={isOwnAccount || isLoading || !hasChanges}
                        >
                          {isLoading ? 'Opslaan...' : 'Opslaan'}
                        </Button>
                        {isOwnAccount && (
                          <span className="text-muted-foreground text-xs">
                            Eigen rol kan niet gewijzigd worden
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                    Geen gebruikers gevonden.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
