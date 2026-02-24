'use client';

import { useState } from 'react';
import { setUserRole } from '@/actions/users';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

function getRoleLabel(role: UserRole | null) {
  if (role === 'admin') return 'Admin';
  if (role === 'sales') return 'Sales';
  return 'Geen rol';
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

  const handleDraftRoleChange = (userId: string, role: UserRole) => {
    setDraftRoles((prev) => ({ ...prev, [userId]: role }));
  };

  const handleSaveRole = async (userId: string) => {
    const role = draftRoles[userId];
    if (!role) return;

    setLoadingUserId(userId);
    setError(null);

    const result = await setUserRole(userId, role);

    if (result.error) {
      setError(result.error._form?.[0] || 'An error occurred');
      setLoadingUserId(null);
      return;
    }

    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role } : user))
    );
    setLoadingUserId(null);
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
