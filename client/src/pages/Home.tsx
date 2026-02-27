import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, AlertCircle, CheckCircle2, Clock, Download } from "lucide-react";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Home() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [urlInput, setUrlInput] = useState("");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const utils = trpc.useUtils();

  const extractMutation = trpc.raceResults.extractResults.useMutation({
    onSuccess: (data) => {
      setCurrentJobId(data.jobId);
      setPollingEnabled(true);
      toast.success(`Processing ${data.totalUrls} URL(s)`);
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const { data: jobStatus, refetch: refetchJobStatus } = trpc.raceResults.getJobStatus.useQuery(
    { jobId: currentJobId! },
    { enabled: !!currentJobId && pollingEnabled, refetchInterval: 2000 }
  );

  const { data: results, refetch: refetchResults } = trpc.raceResults.getResults.useQuery(
    { jobId: currentJobId! },
    { enabled: !!currentJobId && jobStatus?.status === "completed" }
  );

  useEffect(() => {
    if (jobStatus?.status === "completed" || jobStatus?.status === "failed") {
      setPollingEnabled(false);
      refetchResults();
    }
  }, [jobStatus?.status, refetchResults]);

  const handleSubmit = () => {
    const urls = urlInput
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (urls.length === 0) {
      toast.error("Please enter at least one URL");
      return;
    }

    // Validate URLs
    const invalidUrls = urls.filter((url) => {
      try {
        new URL(url);
        return false;
      } catch {
        return true;
      }
    });

    if (invalidUrls.length > 0) {
      toast.error(`Invalid URLs found: ${invalidUrls.join(", ")}`);
      return;
    }

    extractMutation.mutate({ urls });
  };

  const handleClear = () => {
    setUrlInput("");
    setCurrentJobId(null);
    setPollingEnabled(false);
  };

  const handleExport = async (format: "csv" | "json" | "excel") => {
    if (!currentJobId) return;

    try {
      const result = await utils.raceResults.exportResults.fetch({
        jobId: currentJobId,
        format,
      });

      // Create download link
      let blob: Blob;
      if (format === "excel") {
        // Decode base64 for Excel
        const binaryString = atob(result.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: result.mimeType });
      } else {
        blob = new Blob([result.data], { type: result.mimeType });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Race Results Agent</CardTitle>
            <CardDescription>
              Extract race results from timing platform URLs with intelligent scraping
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Sign in to start extracting race results from Sports Timing Solutions and other platforms
            </p>
            <Button asChild className="w-full">
              <a href={getLoginUrl()}>Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Race Results Agent</h1>
          <p className="text-muted-foreground">
            Extract participant data from race timing platforms with adaptive parsing
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Section */}
          <Card>
            <CardHeader>
              <CardTitle>URL Input</CardTitle>
              <CardDescription>
                Paste race timing URLs (one per line) or upload a CSV file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="https://sportstimingsolutions.in/results?q=..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={extractMutation.isPending || pollingEnabled}
                  className="flex-1"
                >
                  {extractMutation.isPending || pollingEnabled ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Extract Results
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Status Section */}
          <Card>
            <CardHeader>
              <CardTitle>Processing Status</CardTitle>
              <CardDescription>Real-time extraction progress</CardDescription>
            </CardHeader>
            <CardContent>
              {!currentJobId && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mb-4 opacity-50" />
                  <p>No active job</p>
                </div>
              )}

              {currentJobId && jobStatus && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status</span>
                    <Badge
                      variant={
                        jobStatus.status === "completed"
                          ? "default"
                          : jobStatus.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {jobStatus.status}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span className="font-medium">
                        {jobStatus.processedUrls} / {jobStatus.totalUrls}
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{
                          width: `${(jobStatus.processedUrls / jobStatus.totalUrls) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-2xl font-bold">{jobStatus.successCount}</p>
                        <p className="text-xs text-muted-foreground">Success</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <div>
                        <p className="text-2xl font-bold">{jobStatus.errorCount}</p>
                        <p className="text-xs text-muted-foreground">Errors</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Section */}
        {results && results.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Extracted Results</CardTitle>
              <CardDescription>
                {results.length} result(s) extracted
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Race Name</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Finish Time</TableHead>
                      <TableHead>BIB</TableHead>
                      <TableHead>Rank (Overall)</TableHead>
                      <TableHead>Rank (Category)</TableHead>
                      <TableHead>Pace</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow key={result.id}>
                        <TableCell className="font-medium text-primary">
                          {result.raceName || "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {result.name || "-"}
                        </TableCell>
                        <TableCell>{result.category || "-"}</TableCell>
                        <TableCell>{result.finishTime || "-"}</TableCell>
                        <TableCell>{result.bibNumber || "-"}</TableCell>
                        <TableCell>{result.rankOverall || "-"}</TableCell>
                        <TableCell>{result.rankCategory || "-"}</TableCell>
                        <TableCell>{result.pace || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{result.platform}</Badge>
                        </TableCell>
                        <TableCell>
                          {result.status === "completed" ? (
                            <Badge variant="default">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Error
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {results.some((r) => r.status === "error") && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Some URLs failed to extract. Check the error messages for details.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => handleExport("csv")}
                  disabled={!currentJobId}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport("json")}
                  disabled={!currentJobId}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport("excel")}
                  disabled={!currentJobId}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export Excel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
