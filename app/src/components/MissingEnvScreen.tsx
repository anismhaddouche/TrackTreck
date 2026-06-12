import { AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface MissingEnvScreenProps {
  missing: string[];
}

export function MissingEnvScreen({ missing }: MissingEnvScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">Configuration required</span>
          </div>
          <CardTitle>Frontend environment variables are missing</CardTitle>
          <CardDescription>
            Copy <code className="font-mono">.env.example</code> to{" "}
            <code className="font-mono">.env.local</code> and provide the values
            below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {missing.map((key) => (
              <li key={key}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {key}
                </code>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Only public, anon-key values belong here. The Supabase service-role
            key must never be exposed to the browser.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
