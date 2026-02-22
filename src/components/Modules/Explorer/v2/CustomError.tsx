import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "src/components/v2/ui/button";
import { Alert, AlertDescription } from "src/components/v2/ui/alert";

const isLocalnet = process.env.REACT_APP_NETWORK === "Localnet";
const TOTAL_RETRIES = 5;

function getRetries(hash: string): number {
  const regex = /retry=(\d)/g;
  const match = regex.exec(hash);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

function CustomError({ error }: { error?: string }): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [retry, setRetry] = useState(0);
  const [countdown, setCountdown] = useState(2);

  useEffect(() => {
    let tmot: ReturnType<typeof setTimeout>;
    if (isLocalnet) {
      const retry = getRetries(location.hash);
      setRetry(retry);
      if (retry < TOTAL_RETRIES) {
        const newLocation = new URL(window.location.href);
        newLocation.hash = `#retry=${retry + 1}`;
        setTimeout(() => setCountdown(1), 1_000);
        tmot = setTimeout(() => {
          setCountdown(0);
          window.history.replaceState(null, null, newLocation.toString());
          window.location.reload();
        }, 2_000);
      }
    }
    return () => clearTimeout(tmot);
  }, [location.hash]);

  return (
    <div className="mt-36 mb-8">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-12 md:col-span-7 lg:col-span-6">
          <h4 className="text-2xl font-bold text-foreground">
            Something went wrong
          </h4>
          <Alert className="mt-5 bg-background-card border-none text-foreground rounded-lg">
            <AlertDescription>
              The resource you are looking for is not available.
            </AlertDescription>
          </Alert>
          {isLocalnet ? (
            <Alert className="mt-5 bg-background-card border-none text-foreground rounded-lg">
              <AlertDescription>
                Localnet retry {retry} / {TOTAL_RETRIES} &middot;{" "}
                {retry < TOTAL_RETRIES ? (
                  <>Retrying in {countdown} seconds</>
                ) : (
                  <>Retries exhausted</>
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-5">
            <Button
              variant="outline"
              className="border-border text-primary hover:bg-primary/10"
              onClick={() => navigate("/explorer")}
            >
              Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CustomError;
