import { Container } from "@/components/primitives";
import { ShopGridSkeleton, Skeleton } from "@/components/Skeleton";

/** Route-level loading UI (App Router). Shown during navigation/streaming. */
export default function Loading() {
  return (
    <Container className="py-12">
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="mt-10">
        <Skeleton className="mb-6 h-8 w-48" />
        <ShopGridSkeleton count={8} />
      </div>
    </Container>
  );
}
