import { SignUp } from "@clerk/nextjs"

// To update login providers, app branding, or OAuth settings use the Auth
// pane in the workspace toolbar. More information can be found in the Replit docs.
export default function SignUpPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#060D18",
        padding: "1rem",
      }}
    >
      <SignUp />
    </div>
  )
}
