import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoleCard as RoleCardType } from "@/services/roles";

export function RoleCards({ roles }: { roles: RoleCardType[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {roles.map((role) => (
        <Card key={role.id}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {role.abbreviation}
              </div>
              <div>
                <CardTitle className="text-base">{role.name}</CardTitle>
                <CardDescription>{role.peopleCount} people</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{role.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
