import React, { Suspense } from "react";
const QRCode = React.lazy(() => import("react-qr-code"));
import { QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "src/components/v2/ui/dialog";
import { cn } from "src/lib/utils";

const label = "Address QR Code";

export default function AddressQRButton({ address, className }: { address: string; className?: string }): JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn("inline-flex items-center justify-center shrink-0 cursor-pointer px-[2px] -my-0.5 align-middle", className)}
        >
          <span className="shrink-0">
            <QrCode size="1em" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription className="break-all">{address}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <div className="w-full max-w-72 bg-white p-4">
            <Suspense fallback={<div className="aspect-square w-full" />}>
              <QRCode className="block h-auto w-full" value={`algorand://${address}`} />
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
