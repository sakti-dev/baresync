interface StatusMessageProps {
  status: string;
}

export function StatusMessage({ status }: StatusMessageProps) {
  return <p className="pl-1 font-mono text-sm text-wood-500">{status}</p>;
}
