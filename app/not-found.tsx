import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-10 max-w-md px-6 py-10 text-center">
      <p className="text-4xl font-bold text-fg">404</p>
      <p className="mt-2 text-sm text-fg-secondary">Sayfa bulunamadı · Page not found</p>
      <Link href="/" className="btn btn-primary mt-5">
        LoL Advisor
      </Link>
    </div>
  );
}
