import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api, ApiError, type ApiProduct } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import AdminProductsPage from "@/app/products/page";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: jest.fn(),
      adminCreateProduct: jest.fn(),
      adminUpdateProduct: jest.fn(),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { _id: "admin-id", name: "Panel", role: "admin" } }),
}));

// ကျွန်တော်တို့ catalog အမှန် — title က category box ထဲ ဝင်နေတဲ့ row။
const PRODUCT: ApiProduct = {
  _id: "65f0000000000000000000b1",
  name: "Toys",
  code: "Walmart",
  category:
    "MAX BUILD MORE Premium Retro Collection by ZURU - Surprise Blind Unboxing Fun",
  usage: "Age range 8 years & Up",
  description: "",
  imageUrl: null,
  price: { $numberDecimal: "20.19" },
};

// Backend က description ကို 2000 လုံးပဲ ခွင့်တယ် — form မှာ field မရှိတုန်းက
// ဒီလိုရှည်နေတဲ့ row ကို ပြင်လို့မရတော့ဘူး။
const OVERLONG_DESCRIPTION = "D".repeat(2001);

const LONG_DESCRIPTION: ApiProduct = {
  ...PRODUCT,
  description: OVERLONG_DESCRIPTION,
};

function tooLong(path: string, max = 100): { path: string[]; message: string } {
  return {
    path: [path],
    message: `Too big: expected string to have <=${max} characters`,
  };
}

function listProducts(products: ApiProduct[] = [PRODUCT]) {
  (api.get as jest.Mock).mockResolvedValue({ products });
}

async function renderAndOpenEdit(product: ApiProduct = PRODUCT) {
  listProducts([product]);
  render(
    <LanguageProvider>
      <AdminProductsPage />
    </LanguageProvider>,
  );

  await screen.findByText(product.name);
  await userEvent.click(screen.getByTitle("Edit"));

  return screen.findByTestId("product-form");
}

describe("admin products page validation banner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("names the field the server rejected instead of a bare Validation failed", async () => {
    await renderAndOpenEdit();

    (api.adminUpdateProduct as jest.Mock).mockRejectedValue(
      new ApiError(400, "Validation failed", [tooLong("category")]),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Check these fields: Category"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Validation failed"),
    ).not.toBeInTheDocument();
  });

  it("lists every rejected field once, using the form labels", async () => {
    await renderAndOpenEdit();

    (api.adminUpdateProduct as jest.Mock).mockRejectedValue(
      new ApiError(400, "Validation failed", [
        tooLong("name"),
        tooLong("category"),
        tooLong("description"),
      ]),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Check these fields: Title, Category, Description"),
    ).toBeInTheDocument();
  });

  it("names the field on a new product too", async () => {
    listProducts();
    render(
      <LanguageProvider>
        <AdminProductsPage />
      </LanguageProvider>,
    );

    await screen.findByText(PRODUCT.name);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    (api.adminCreateProduct as jest.Mock).mockRejectedValue(
      new ApiError(400, "Validation failed", [tooLong("category")]),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Check these fields: Category"),
    ).toBeInTheDocument();
    expect(api.adminUpdateProduct).not.toHaveBeenCalled();
  });

  it("keeps the server message when no field list comes back", async () => {
    await renderAndOpenEdit();

    (api.adminUpdateProduct as jest.Mock).mockRejectedValue(
      new ApiError(400, "Price must be between 0.01 and 5000.00"),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Price must be between 0.01 and 5000.00"),
    ).toBeInTheDocument();
  });

  it("shows the raw key for a field the dictionary does not label", async () => {
    await renderAndOpenEdit();

    (api.adminUpdateProduct as jest.Mock).mockRejectedValue(
      new ApiError(400, "Validation failed", [tooLong("commission")]),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Check these fields: commission"),
    ).toBeInTheDocument();
  });
});

describe("admin products description field", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens an over-long description so it can be shortened and saved", async () => {
    await renderAndOpenEdit(LONG_DESCRIPTION);

    const box = screen.getByLabelText("Description");
    expect(box).toHaveValue(OVERLONG_DESCRIPTION);

    (api.adminUpdateProduct as jest.Mock).mockRejectedValue(
      new ApiError(400, "Validation failed", [tooLong("description", 2000)]),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Check these fields: Description"),
    ).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, "Blind box, 8 years and up.", { skipClick: true });
    (api.adminUpdateProduct as jest.Mock).mockResolvedValue({
      product: LONG_DESCRIPTION,
    });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.adminUpdateProduct).toHaveBeenLastCalledWith(
      LONG_DESCRIPTION._id,
      expect.objectContaining({
        name: PRODUCT.name,
        description: "Blind box, 8 years and up.",
      }),
    );
  });

  it("sends the description when creating a new product", async () => {
    listProducts();
    render(
      <LanguageProvider>
        <AdminProductsPage />
      </LanguageProvider>,
    );

    await screen.findByText(PRODUCT.name);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await userEvent.type(screen.getByLabelText("Title"), "New item");
    await userEvent.type(screen.getByLabelText("Price"), "5.00");
    await userEvent.type(
      screen.getByLabelText("Description"),
      "Works out of the box",
    );

    (api.adminCreateProduct as jest.Mock).mockResolvedValue({
      product: PRODUCT,
    });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.adminCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Works out of the box" }),
    );
  });
});
