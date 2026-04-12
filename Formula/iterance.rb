class Iterance < Formula
  desc "Behavioral witness layer for AI agents. Watches. Records. Tells you everything."
  homepage "https://github.com/Tetrahedroned/iterance"
  url "https://github.com/Tetrahedroned/iterance/archive/refs/tags/v0.2.0.tar.gz"
  sha256 "FILL_IN_AFTER_RELEASE"
  license "MIT"

  depends_on "python@3.11"
  depends_on "git"

  resource "watchdog" do
    url "https://files.pythonhosted.org/packages/watchdog-latest.tar.gz"
    sha256 "FILL_IN"
  end

  resource "textual" do
    url "https://files.pythonhosted.org/packages/textual-latest.tar.gz"
    sha256 "FILL_IN"
  end

  def install
    virtualenv_install_with_resources
    bin.install "iterance/cli.py" => "iterance"
  end

  test do
    system "#{bin}/iterance", "help"
  end
end
