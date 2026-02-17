import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <p className="text-8xl font-bold mb-2">
        4<span className="text-accent">0</span>4
      </p>
      <p className="text-text-muted text-lg mb-8">
        This soul has moved on to the other side.
      </p>
      <Link
        href="/"
        className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md shadow-accent/20"
      >
        Go Home
      </Link>
    </div>
  );
}
