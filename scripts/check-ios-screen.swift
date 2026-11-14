// Inspect the actual simulator screenshot. No UI is drawn or substituted by this check.
import Foundation
import Vision
import ImageIO
let path=CommandLine.arguments[1]
guard let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:path) as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil) else {fatalError("Missing native simulator screenshot")}
let request=VNRecognizeTextRequest()
request.recognitionLevel = .accurate
try VNImageRequestHandler(cgImage:image,options:[:]).perform([request])
let text=(request.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator:" ")
guard text.contains("Your Personal Agent"),text.contains("Pair this device"),!text.localizedCaseInsensitiveContains("entitlement"),!text.localizedCaseInsensitiveContains("has failed") else {fatalError("Native pairing screen or secure-storage startup check failed: \(text)")}
print("Actual native pairing screen visible; secure-storage round trip did not report a startup failure")
