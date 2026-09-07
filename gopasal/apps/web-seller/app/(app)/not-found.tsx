import { Button } from "@/components/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-bold text-crimson-500">404</p>
      <h1 className="mt-3 text-2xl font-bold text-ink-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <div className="mt-6">
        <Button href="/dashboard">Back to dashboard</Button>
      </div>
    </div>
  );
}
