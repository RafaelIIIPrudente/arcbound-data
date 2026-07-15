"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PermissionGroup } from "@/services/team";

export function PermissionsMatrix({ groups }: { groups: PermissionGroup[] }) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.name} className="space-y-3">
          <h3 className="text-sm font-medium">{group.name}</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permission</TableHead>
                  <TableHead className="text-center">Member</TableHead>
                  <TableHead className="text-center">Manager</TableHead>
                  <TableHead className="text-center">Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.permissions.map((permission) => (
                  <TableRow key={permission.name}>
                    <TableCell>{permission.name}</TableCell>
                    {(["member", "manager", "admin"] as const).map((column) => (
                      <TableCell key={column}>
                        <div className="flex justify-center">
                          <Checkbox
                            defaultChecked={permission[column]}
                            disabled={permission.readOnly}
                          />
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
