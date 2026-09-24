import path from "node:path";
import { readFileSync } from "node:fs";
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// The authorised signatory's signature, read once into a Buffer (not passed as
// a path string): @react-pdf resolves string sources through a URL parser that
// misreads a Windows drive letter ("C:\...") as a URL scheme — see loadPdfLogo
// in InvoicePdf.tsx. The file ships with the build via the postbuild asset copy.
const signatureBuffer = readFileSync(path.resolve(__dirname, "../assets/authorized-signatory.png"));

const styles = StyleSheet.create({
  box: { width: 170, alignItems: "center" },
  small: { fontSize: 8, color: "#5c564f" },
  // The source image is 280×120 (7:3); drawn at 84×36 pt.
  signature: { width: 84, height: 36, marginTop: 2 },
  line: { borderTopWidth: 0.5, borderTopColor: "#5c564f", width: "100%", marginTop: 2, paddingTop: 3, textAlign: "center", fontSize: 8 },
});

/** "For {company}", the signature, and the "Authorised Signatory" line — shared by every invoice and bill. */
export function SignatoryBlock({ legalName }: { legalName: string }) {
  return (
    <View style={styles.box} wrap={false}>
      <Text style={styles.small}>For {legalName}</Text>
      <Image src={signatureBuffer} style={styles.signature} />
      <Text style={styles.line}>Authorised Signatory</Text>
    </View>
  );
}
