# Assemble separately uploaded native build outputs before touching the GitHub draft.
require 'base64'
require 'date'
require 'digest'
require 'fileutils'
require 'yaml'

tag, output, *builds = ARGV
version = tag.delete_prefix('v')
abort 'Expected a stable release tag' unless tag.match?(/\Av\d+\.\d+\.\d+\z/)
abort 'Expected five native build outputs' unless builds.size == 5

manifests = {
  'update-mac-arm64.yml' => ['latest-arm64-mac.yml', 'mac-arm64.zip'],
  'update-mac-x64.yml' => ['latest-x64-mac.yml', 'mac-x64.zip'],
  'update-linux-x64.yml' => ['latest-linux.yml', 'linux-x86_64.AppImage'],
  'update-linux-arm64.yml' => ['latest-linux-arm64.yml', 'linux-arm64.AppImage']
}
installer = /\AOpenMotionStudio-#{Regexp.escape(version)}-[\w-]+\.(?:dmg|zip|exe|AppImage|tar\.gz)(?:\.blockmap)?\z/
installed_manifests = []

builds.each do |build|
  Dir.children(build).each do |name|
    source = File.join(build, name)
    if manifests.key?(name)
      destination, suffix = manifests.fetch(name)
      manifest = YAML.safe_load_file(source, permitted_classes: [Time, Date])
      files = manifest.fetch('files')
      expected = "OpenMotionStudio-#{version}-#{suffix}"
      abort "Wrong version or installer in #{source}" unless manifest.fetch('version') == version &&
        files.any? { |file| file.fetch('url') == expected }
      files.each do |file|
        filename = file.fetch('url')
        abort "Unexpected asset in #{source}" unless filename.match?(installer)
        path = File.join(build, filename)
        sha512 = Base64.strict_encode64(Digest::SHA512.file(path).digest)
        abort "Size or checksum mismatch for #{path}" unless file.fetch('size') == File.size(path) &&
          file.fetch('sha512') == sha512
      end
      installed_manifests << name
    elsif name.match?(installer)
      destination = name
    else
      abort "Unexpected artifact #{source}"
    end
    target = File.join(output, destination)
    abort "Duplicate artifact #{destination}" if File.exist?(target)
    FileUtils.cp(source, target)
  end
end

abort 'Missing Linux update metadata' unless %w[update-linux-x64.yml update-linux-arm64.yml].all? { |name| installed_manifests.include?(name) }
mac_count = installed_manifests.count { |name| name.start_with?('update-mac-') }
abort 'Incomplete macOS update metadata' unless [0, 2].include?(mac_count)

%w[
  mac-arm64.dmg mac-arm64.zip mac-x64.dmg mac-x64.zip win-x64.exe
  linux-x86_64.AppImage linux-arm64.AppImage linux-x64.tar.gz linux-arm64.tar.gz
].each do |suffix|
  filename = "OpenMotionStudio-#{version}-#{suffix}"
  abort "Missing installer #{filename}" unless File.file?(File.join(output, filename))
end
