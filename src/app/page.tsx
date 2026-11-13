import { auth } from "@/lib/auth";
import Console from "@/components/Console";

// The console. Middleware already guarantees a session; we read it here to
// show who's signed in.

export default async function Page() {
  const session = await auth();
  return (
    <Console
      operatorName={session?.user?.name ?? session?.user?.email ?? undefined}
      operatorRole={session?.user?.role}
    />
  );
}
