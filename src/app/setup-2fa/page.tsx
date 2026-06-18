import { Setup2FAForm } from "./setup-form";

export default function Setup2FAPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="font-serif text-3xl font-bold tracking-tight text-primary">
            Setup Two-Factor Auth
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Scan the QR code with your Authy app to secure your account.
          </p>
        </div>
        <Setup2FAForm />
      </div>
    </div>
  );
}
