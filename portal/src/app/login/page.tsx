import { signIn } from "@/lib/auth";
import { LoginPageChrome } from "@/components/login/LoginPageChrome";
import { LoginSsoButton } from "@/components/login/LoginSsoButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg-base text-text-primary">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 600px at 18% 22%, rgba(30,77,140,0.22), transparent 60%)," +
            "radial-gradient(800px 500px at 82% 78%, rgba(124,58,237,0.16), transparent 65%)," +
            "radial-gradient(700px 500px at 50% 100%, rgba(5,150,105,0.12), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse at center, black 35%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 35%, transparent 75%)",
        }}
      />

      <LoginPageChrome error={error}>
        <form
          action={async () => {
            "use server";
            await signIn("keycloak", {
              redirectTo: callbackUrl || "/corehub/dashboard",
            });
          }}
        >
          <LoginSsoButton />
        </form>
      </LoginPageChrome>
    </div>
  );
}
