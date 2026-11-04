import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletEditor from "@/app/components/WalletEditor";
import { LanguageProvider } from "@/lib/i18n";
import { uploadToImageKit } from "@/lib/uploadImage";

jest.mock("@/lib/uploadImage", () => ({
  uploadToImageKit: jest.fn(),
  validateImageFile: jest.fn(),
}));

const ADDRESS = "TQrQm4f8wV1sXh2yKd9nJb6pLc3zRt5aXe";
const QR_URL = "https://ik.imagekit.io/testid/wallet-qr/qr.png";

function png() {
  return new File(["qr"], "qr.png", { type: "image/png" });
}

function renderEditor(onChange = jest.fn()) {
  render(
    <LanguageProvider>
      <WalletEditor
        address={ADDRESS}
        qrUrl=""
        password="admin123456"
        onChange={onChange}
        onPasswordChange={jest.fn()}
        onSave={jest.fn()}
      />
    </LanguageProvider>,
  );

  return onChange;
}

describe("WalletEditor QR upload", () => {
  beforeEach(() => {
    (uploadToImageKit as jest.Mock).mockReset();
  });

  it("no longer offers a pastable URL box", () => {
    renderEditor();

    expect(screen.queryByTestId("wallet-qr-url")).toBeNull();
    expect(screen.getByText("QR code image")).toBeInTheDocument();
  });

  it("sends the picked image to ImageKit and keeps the returned URL", async () => {
    const user = userEvent.setup();
    (uploadToImageKit as jest.Mock).mockResolvedValue(QR_URL);
    const onChange = renderEditor();

    await user.upload(screen.getByTestId("wallet-qr-file"), png());

    expect(uploadToImageKit).toHaveBeenCalledWith(expect.any(File), "wallet-qr");
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ qrUrl: QR_URL }),
    );
  });

  it("shows why an upload failed instead of failing silently", async () => {
    const user = userEvent.setup();
    (uploadToImageKit as jest.Mock).mockRejectedValue(
      new Error("Image must be 10MB or smaller"),
    );
    const onChange = renderEditor();

    await user.upload(screen.getByTestId("wallet-qr-file"), png());

    expect(await screen.findByText("Image must be 10MB or smaller")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blocks the save until the upload settles", async () => {
    const user = userEvent.setup();
    let resolveUpload: (url: string) => void = () => {};
    (uploadToImageKit as jest.Mock).mockImplementation(
      () => new Promise<string>((resolve) => (resolveUpload = resolve)),
    );
    renderEditor();

    await user.upload(screen.getByTestId("wallet-qr-file"), png());
    const save = screen.getByRole("button", { name: "Save wallet" });
    expect(save).toBeDisabled();

    resolveUpload(QR_URL);
    await waitFor(() => expect(save).toBeEnabled());
  });
});

describe("WalletEditor owner view", () => {
  function renderReadOnly(props: { address?: string; qrUrl?: string } = {}) {
    render(
      <LanguageProvider>
        <WalletEditor
          address={props.address ?? ADDRESS}
          qrUrl={props.qrUrl ?? ""}
          password=""
          readOnly
          onChange={jest.fn()}
          onPasswordChange={jest.fn()}
          onSave={jest.fn()}
        />
      </LanguageProvider>,
    );
  }

  it("shows the address with nothing that can write it", () => {
    renderReadOnly();

    expect(screen.getByTestId("wallet-readonly-address")).toHaveTextContent(
      ADDRESS,
    );
    expect(screen.queryByTestId("wallet-address")).toBeNull();
    expect(screen.queryByTestId("wallet-password")).toBeNull();
    expect(screen.queryByTestId("wallet-qr-file")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save wallet" }),
    ).toBeNull();
  });

  it("tells the owner an administrator owns this address", () => {
    renderReadOnly();

    expect(
      screen.getByText(/administrator sets and changes this address/i),
    ).toBeInTheDocument();
  });

  it("says nothing is configured until an admin sets it", () => {
    renderReadOnly({ address: "" });

    expect(screen.queryByTestId("wallet-readonly-address")).toBeNull();
    expect(screen.getAllByText("Not configured yet").length).toBeGreaterThan(0);
  });

  it("keeps the uploaded QR visible for the owner", () => {
    renderReadOnly({ qrUrl: QR_URL });

    expect(screen.getByAltText("QR")).toHaveAttribute("src", QR_URL);
  });
});
